import type { Pool, PoolClient } from "pg";
import type { AssetBatchInput, AssetImportInput, AssetImportRow, LabAsset, LabDeviceType, LabNote, LabPlatform, LabPlatformType, LocalizedText, UsageReviewInput } from "./schemas.js";

type TransactionPool = Pick<Pool, "connect">;
type AuditInput = { actorId: string; action: string; targetType: string; targetId: string; revision: string; detail?: Record<string, unknown> };
type ErrorWithCleanupFailures = Error & { cleanupFailures?: unknown[] };
type SnapshotActor = { id: string; canManage: boolean };
type Dependencies = { getSnapshot?: (actor: SnapshotActor) => Promise<any> };
type UsageReview = Omit<UsageReviewInput,"expectedRevision">;

export type { LabAsset, LabDeviceType, LabNote, LabPlatform, LabPlatformType } from "./schemas.js";
export class ConflictError extends Error { constructor(message: string) { super(message); this.name = "ConflictError"; } }
export class RevisionConflictError extends Error { constructor() { super("Lab assets revision conflict"); this.name = "RevisionConflictError"; } }
export type AssetImportIssue={field:string;message:string;severity:"error"|"warning"};
export type AssetImportResultRow={index:number;row:AssetImportRow;issues:AssetImportIssue[]};
export type AssetImportReport={summary:{total:number;valid:number;warnings:number;errors:number};rows:AssetImportResultRow[]};
export class ImportValidationError extends Error { constructor(readonly report:AssetImportReport) { super("Asset import validation failed"); this.name="ImportValidationError"; } }

function localized(zh?: string | null, en?: string | null): LocalizedText { return { zh: zh ?? "", en: en ?? "" }; }
function natural(left: string, right: string) { return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" }); }
function attachCleanupFailure(primaryError: unknown, cleanupError: unknown) { if (primaryError instanceof Error) { const error = primaryError as ErrorWithCleanupFailures; error.cleanupFailures ??= []; error.cleanupFailures.push(cleanupError); } }

async function claimRevision(client: PoolClient, expectedRevision: string) {
  const result = await client.query<{ revision: string }>(`UPDATE site_content_revisions SET revision=revision+1,updated_at=now() WHERE module_key='lab-assets' AND revision=$1::bigint RETURNING revision::text revision`, [expectedRevision]);
  if (!result.rowCount) throw new RevisionConflictError();
  return result.rows[0].revision;
}

async function audit(client: PoolClient, input: AuditInput) {
  await client.query(`INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)`, [input.actorId,input.action,input.targetType,input.targetId,JSON.stringify({ revision: input.revision, ...input.detail })]);
}

export function createLabAssetsService(pool: TransactionPool, dependencies: Dependencies = {}) {
  async function transaction<T>(invoke: (client: PoolClient) => Promise<T>) {
    const client = await pool.connect(); let primaryError: unknown;
    try { await client.query("BEGIN"); const result = await invoke(client); await client.query("COMMIT"); return result; }
    catch (error) { primaryError = error; try { await client.query("ROLLBACK"); } catch (cleanup) { attachCleanupFailure(primaryError, cleanup); } }
    finally { try { client.release(); } catch (cleanup) { if (primaryError === undefined) throw cleanup; attachCleanupFailure(primaryError, cleanup); } }
    throw primaryError;
  }

  async function mutate(input: Omit<AuditInput,"revision"> & { expectedRevision: string }, write: (client: PoolClient) => Promise<void>) {
    return transaction(async (client) => { const revision = await claimRevision(client,input.expectedRevision); await write(client); await audit(client,{...input,revision}); return revision; });
  }

  async function findId(client: PoolClient, table: "lab_platforms"|"lab_platform_types"|"lab_device_types", code: string) {
    const result = await client.query<{id:string}>(`SELECT id FROM ${table} WHERE code=$1 LIMIT 1`,[code]);
    if (!result.rowCount) throw new ConflictError(`${table === "lab_platforms" ? "Platform" : table === "lab_platform_types" ? "Platform type" : "Device type"} not found`);
    return result.rows[0].id;
  }

  async function findDeviceType(client:PoolClient,code:string){const result=await client.query<{id:string;name:string}>(`SELECT id,name FROM lab_device_types WHERE code=$1 LIMIT 1`,[code]);if(!result.rowCount)throw new ConflictError("Device type not found");return result.rows[0];}

  async function duplicate(client: PoolClient, table: string, code: string, currentCode?: string) {
    const result=await client.query(`SELECT 1 FROM ${table} WHERE code=$1${currentCode===undefined?"":" AND code<>$2"} LIMIT 1`,currentCode===undefined?[code]:[code,currentCode]);
    return Boolean(result.rowCount);
  }
  function requireAffected(result:{rowCount:number|null},target:string){if(!result.rowCount)throw new ConflictError(`${target} not found`);}

  async function getSnapshot(actor: SnapshotActor={id:"",canManage:false}) {
    const client=await pool.connect();let primaryError:unknown;
    try{
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const [pageResult,revisionResult,platformTypesResult,deviceTypesResult,platformsResult,assetsResult,membersResult,requestsResult]=await Promise.all([
        client.query(`SELECT content_json FROM page_content WHERE page_key='lab_assets_page' LIMIT 1`),
        client.query(`SELECT revision::text revision FROM site_content_revisions WHERE module_key='lab-assets'`),
        client.query(`SELECT code,COALESCE(NULLIF(name_zh,''),NULLIF(name_en,''),code) name FROM lab_platform_types ORDER BY COALESCE(NULLIF(name_zh,''),NULLIF(name_en,''),code),code`),
        client.query(`SELECT code,name FROM lab_device_types ORDER BY name,code`),
        client.query(`SELECT p.code,t.code type_code,p.name_zh,p.name_en,p.description_zh,p.description_en,p.status FROM lab_platforms p JOIN lab_platform_types t ON t.id=p.type_id ORDER BY COALESCE(NULLIF(t.name_zh,''),NULLIF(t.name_en,''),t.code),p.code`),
        client.query(`SELECT a.code,dt.code device_type_code,dt.name device_type_name,a.model,a.name_zh,a.name_en,a.description_zh,a.description_en,a.vendor_serial,a.status,p.code current_platform_code,a.assigned_user_id,u.display_name assigned_user_name,a.borrower_name,a.borrower_contact,a.storage_location,a.updated_at
          FROM lab_assets a JOIN lab_device_types dt ON dt.id=a.device_type_id LEFT JOIN lab_platforms p ON p.id=a.current_platform_id LEFT JOIN users u ON u.id=a.assigned_user_id ORDER BY dt.name,a.code`),
        actor.canManage?client.query(`SELECT id,username,display_name FROM users WHERE status='active' ORDER BY display_name,username`):Promise.resolve({rows:[]}),
        client.query(`SELECT r.id,r.status,r.reason,r.review_note,r.created_at,r.reviewed_at,a.code asset_code,a.name_zh asset_name_zh,a.name_en asset_name_en,u.id requester_id,u.display_name requester_name,reviewer.display_name reviewer_name
          FROM lab_asset_usage_requests r JOIN lab_assets a ON a.id=r.asset_id JOIN users u ON u.id=r.requester_id LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by
          WHERE $1::boolean OR r.requester_id=$2 ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.created_at DESC`,[actor.canManage,actor.id]),
      ]);
      const assets=assetsResult.rows.map((row:any)=>({code:row.code,deviceTypeCode:row.device_type_code,deviceTypeName:row.device_type_name,model:row.model??"",name:localized(row.name_zh,row.name_en),description:localized(row.description_zh,row.description_en),vendorSerial:row.vendor_serial??"",status:row.status,currentPlatformCode:row.current_platform_code,assignedUserId:row.assigned_user_id,assignedUserName:row.assigned_user_name??"",borrowerName:row.borrower_name??"",borrowerContact:row.borrower_contact??"",storageLocation:row.storage_location??null,updatedAt:row.updated_at})).sort((a:any,b:any)=>natural(a.deviceTypeName,b.deviceTypeName)||natural(a.code,b.code));
      const assetCodesByPlatform=new Map<string,string[]>();for(const asset of assets){if(!asset.currentPlatformCode)continue;const codes=assetCodesByPlatform.get(asset.currentPlatformCode)??[];codes.push(asset.code);assetCodesByPlatform.set(asset.currentPlatformCode,codes);}
      const platforms=platformsResult.rows.map((row:any)=>({code:row.code,typeCode:row.type_code,name:localized(row.name_zh,row.name_en),description:localized(row.description_zh,row.description_en),status:row.status,assetCodes:(assetCodesByPlatform.get(row.code)??[]).sort(natural)}));
      const platformTypes=platformTypesResult.rows.map((row:any)=>({code:row.code,name:row.name,platforms:platforms.filter((item:any)=>item.typeCode===row.code).sort((a:any,b:any)=>natural(a.code,b.code))}));
      const count=(status:string)=>assets.filter((item:any)=>item.status===status).length;
      const snapshot={page:pageResult.rows[0]?.content_json??{},revision:revisionResult.rows[0]?.revision??"0",platformTypes,deviceTypes:deviceTypesResult.rows.map((row:any)=>({code:row.code,name:row.name})),platforms,assets,members:membersResult.rows.map((row:any)=>({id:row.id,username:row.username,displayName:row.display_name})),usageRequests:requestsResult.rows.map((row:any)=>({id:row.id,status:row.status,reason:row.reason,reviewNote:row.review_note,createdAt:row.created_at,reviewedAt:row.reviewed_at,assetCode:row.asset_code,assetName:localized(row.asset_name_zh,row.asset_name_en),requesterId:row.requester_id,requesterName:row.requester_name,reviewerName:row.reviewer_name??""})),stats:{totalPlatforms:platforms.length,activePlatforms:platforms.filter((item:any)=>item.status==="active").length,totalAssets:assets.length,idleAssets:count("idle"),inUseAssets:count("in_use"),mountedAssets:count("mounted"),maintenanceAssets:count("maintenance"),lentAssets:count("lend"),pendingRequests:requestsResult.rows.filter((row:any)=>row.status==="pending").length}};
      await client.query("COMMIT");return snapshot;
    }catch(error){primaryError=error;try{await client.query("ROLLBACK");}catch(cleanup){attachCleanupFailure(primaryError,cleanup);}}
    finally{try{client.release();}catch(cleanup){if(primaryError===undefined)throw cleanup;attachCleanupFailure(primaryError,cleanup);}}
    throw primaryError;
  }

  async function writeAsset(client:PoolClient,asset:LabAsset,code?:string,sourceProcurementRequestId?:string){
    const deviceType=await findDeviceType(client,asset.deviceTypeCode),typeId=deviceType.id;
    const platformId=asset.status==="mounted"?await findId(client,"lab_platforms",asset.currentPlatformCode!):null;
    const assignedUserId=asset.status==="in_use"?asset.assignedUserId:null;
    if(assignedUserId){const user=await client.query(`SELECT 1 FROM users WHERE id=$1 AND status='active'`,[assignedUserId]);if(!user.rowCount)throw new ConflictError("Assigned member not found");}
    const borrowerName=asset.status==="lend"?asset.borrowerName:"",borrowerContact=asset.status==="lend"?asset.borrowerContact:"";
    if(code===undefined)await client.query(`INSERT INTO lab_assets(code,device_type_id,device_type_zh,device_type_en,model,name_zh,name_en,description_zh,description_en,vendor_serial,status,current_platform_id,assigned_user_id,borrower_name,borrower_contact,storage_location,source_procurement_request_id,share_scope,sort_order) VALUES($1,$2,$3,'',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'internal',0)`,[asset.code,typeId,deviceType.name,asset.model,asset.name.zh,asset.name.en,asset.description.zh,asset.description.en,asset.vendorSerial,asset.status,platformId,assignedUserId,borrowerName,borrowerContact,asset.storageLocation,sourceProcurementRequestId??null]);
    else requireAffected(await client.query(`UPDATE lab_assets SET code=$1,device_type_id=$2,device_type_zh=$3,device_type_en='',model=$4,name_zh=$5,name_en=$6,description_zh=$7,description_en=$8,vendor_serial=$9,status=$10,current_platform_id=$11,assigned_user_id=$12,borrower_name=$13,borrower_contact=$14,storage_location=$15,updated_at=now() WHERE code=$16`,[asset.code,typeId,deviceType.name,asset.model,asset.name.zh,asset.name.en,asset.description.zh,asset.description.en,asset.vendorSerial,asset.status,platformId,assignedUserId,borrowerName,borrowerContact,asset.storageLocation,code]),"Asset");
  }

  async function validateImportRows(client:PoolClient,rows:AssetImportRow[],createMissingDeviceTypes=false):Promise<AssetImportReport>{
    const codes=rows.map((row)=>row.code),serials=rows.map((row)=>row.vendorSerial.trim().toLocaleLowerCase()).filter(Boolean);
    const [typesResult,platformsResult,existingResult]=await Promise.all([
      client.query<{code:string}>(`SELECT code FROM lab_device_types WHERE code=ANY($1::text[])`,[[...new Set(rows.map((row)=>row.deviceTypeCode))]]),
      client.query<{code:string}>(`SELECT code FROM lab_platforms WHERE code=ANY($1::text[])`,[[...new Set(rows.map((row)=>row.platformCode).filter(Boolean))]]),
      client.query<{code:string;vendor_serial:string}>(`SELECT code,vendor_serial FROM lab_assets WHERE code=ANY($1::text[]) OR LOWER(NULLIF(BTRIM(vendor_serial),''))=ANY($2::text[])`,[codes,serials]),
    ]);
    const knownTypes=new Set(typesResult.rows.map((row)=>row.code)),knownPlatforms=new Set(platformsResult.rows.map((row)=>row.code));
    const existingCodes=new Set(existingResult.rows.map((row)=>row.code)),existingSerials=new Set(existingResult.rows.map((row)=>row.vendor_serial?.trim().toLocaleLowerCase()).filter(Boolean));
    const codeCounts=new Map<string,number>(),serialCounts=new Map<string,number>();
    for(const row of rows){codeCounts.set(row.code,(codeCounts.get(row.code)??0)+1);const serial=row.vendorSerial.trim().toLocaleLowerCase();if(serial)serialCounts.set(serial,(serialCounts.get(serial)??0)+1);}
    const resultRows=rows.map((row,index)=>{const issues:AssetImportIssue[]=[];const serial=row.vendorSerial.trim().toLocaleLowerCase();
      if((codeCounts.get(row.code)??0)>1)issues.push({field:"code",message:"文件内资产编号重复",severity:"error"});
      if(existingCodes.has(row.code))issues.push({field:"code",message:"资产编号已存在",severity:"error"});
      if(serial&&(serialCounts.get(serial)??0)>1)issues.push({field:"vendorSerial",message:"文件内厂商序列号重复",severity:"error"});
      if(serial&&existingSerials.has(serial))issues.push({field:"vendorSerial",message:"厂商序列号已存在",severity:"error"});
      if(!["idle","mounted","maintenance","retired"].includes(row.status))issues.push({field:"status",message:"状态无效，仅支持 idle、mounted、maintenance、retired",severity:"error"});
      if(!knownTypes.has(row.deviceTypeCode))issues.push({field:"deviceTypeCode",message:createMissingDeviceTypes?"设备类型不存在，提交时将自动创建":"设备类型不存在",severity:createMissingDeviceTypes?"warning":"error"});
      if(row.platformCode&&!knownPlatforms.has(row.platformCode))issues.push({field:"platformCode",message:"实验平台不存在",severity:"error"});
      if(row.status==="mounted"&&!row.platformCode)issues.push({field:"platformCode",message:"已装载设备必须指定实验平台",severity:"error"});
      if(row.status!=="mounted"&&row.platformCode)issues.push({field:"platformCode",message:"只有已装载设备可以指定实验平台",severity:"error"});
      if(!row.vendorSerial)issues.push({field:"vendorSerial",message:"未填写厂商序列号",severity:"warning"});
      if(!row.model)issues.push({field:"model",message:"未填写设备型号",severity:"warning"});
      if(!row.storageLocation&&!row.platformCode)issues.push({field:"storageLocation",message:"未填写存放位置",severity:"warning"});
      return{index:index+1,row,issues};});
    const errors=resultRows.filter((row)=>row.issues.some((issue)=>issue.severity==="error")).length,warnings=resultRows.filter((row)=>!row.issues.some((issue)=>issue.severity==="error")&&row.issues.some((issue)=>issue.severity==="warning")).length;
    return{summary:{total:rows.length,valid:rows.length-errors-warnings,warnings,errors},rows:resultRows};
  }

  async function syncPlatformAssets(client:PoolClient,platformId:string,assetCodes:string[]){
    const locked=await client.query<{id:string;code:string}>(`SELECT id,code FROM lab_assets WHERE current_platform_id=$1 OR code=ANY($2::text[]) FOR UPDATE`,[platformId,assetCodes]);
    const selected=new Set(assetCodes);const found=new Set(locked.rows.filter((row)=>selected.has(row.code)).map((row)=>row.code));if(found.size!==selected.size)throw new ConflictError("One or more selected assets do not exist");
    await client.query(`UPDATE lab_assets SET current_platform_id=NULL,status='idle',assigned_user_id=NULL,borrower_name='',borrower_contact='',updated_at=now() WHERE current_platform_id=$1 AND NOT(code=ANY($2::text[]))`,[platformId,assetCodes]);
    if(assetCodes.length)await client.query(`UPDATE lab_assets SET current_platform_id=$1,status='mounted',assigned_user_id=NULL,borrower_name='',borrower_contact='',updated_at=now() WHERE code=ANY($2::text[])`,[platformId,assetCodes]);
  }

  return {
    getSnapshot:dependencies.getSnapshot??getSnapshot,
    createDeviceType:(item:LabDeviceType,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.device-type.create",targetType:"lab_device_types",targetId:item.code},async(client)=>{const duplicateType=await client.query(`SELECT 1 FROM lab_device_types WHERE code=$1 OR name=$2 LIMIT 1`,[item.code,item.name]);if(duplicateType.rowCount)throw new ConflictError("设备类型代码或名称已存在");await client.query(`INSERT INTO lab_device_types(code,name) VALUES($1,$2)`,[item.code,item.name]);}),
    createPlatformType:(item:LabPlatformType,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.platform-type.create",targetType:"lab_platform_types",targetId:item.code},async(client)=>{if(await duplicate(client,"lab_platform_types",item.code))throw new ConflictError("Platform type code already exists");await client.query(`INSERT INTO lab_platform_types(code,name_zh,name_en,description_zh,description_en,sort_order) VALUES($1,$2,'','','',0)`,[item.code,item.name]);}),
    updatePlatformType:(code:string,item:LabPlatformType,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.platform-type.update",targetType:"lab_platform_types",targetId:code},async(client)=>{if(await duplicate(client,"lab_platform_types",item.code,code))throw new ConflictError("Platform type code already exists");requireAffected(await client.query(`UPDATE lab_platform_types SET code=$1,name_zh=$2,name_en='',updated_at=now() WHERE code=$3`,[item.code,item.name,code]),"Platform type");}),
    deletePlatformType:(code:string,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.platform-type.delete",targetType:"lab_platform_types",targetId:code},async(client)=>{const id=await findId(client,"lab_platform_types",code);const referenced=await client.query(`SELECT 1 FROM lab_platforms WHERE type_id=$1 LIMIT 1`,[id]);if(referenced.rowCount)throw new ConflictError("Platform type is still referenced");requireAffected(await client.query(`DELETE FROM lab_platform_types WHERE id=$1`,[id]),"Platform type");}),
    createAsset:(item:LabAsset,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.asset.create",targetType:"lab_assets",targetId:item.code},async(client)=>{if(await duplicate(client,"lab_assets",item.code))throw new ConflictError("Asset code already exists");await writeAsset(client,item);}),
    batchAssets:(input:AssetBatchInput,actorId:string)=>transaction(async(client)=>{
      const revision=await claimRevision(client,input.expectedRevision);
      const locked=await client.query<{code:string}>(`SELECT code FROM lab_assets WHERE code=ANY($1::text[]) FOR UPDATE`,[input.assetCodes]);
      if(locked.rows.length!==input.assetCodes.length)throw new ConflictError("One or more selected assets do not exist");
      if(input.action==="set_status"){
        await client.query(`UPDATE lab_assets SET status=$2,current_platform_id=NULL,assigned_user_id=NULL,borrower_name='',borrower_contact='',updated_at=now() WHERE code=ANY($1::text[])`,[input.assetCodes,input.value]);
      }else if(input.action==="set_device_type"){
        const deviceType=await findDeviceType(client,input.value);
        await client.query(`UPDATE lab_assets SET device_type_id=$2,device_type_zh=$3,device_type_en='',updated_at=now() WHERE code=ANY($1::text[])`,[input.assetCodes,deviceType.id,deviceType.name]);
      }else if(input.action==="set_platform"){
        const platformId=input.value===null?null:await findId(client,"lab_platforms",input.value);
        await client.query(`UPDATE lab_assets SET status=CASE WHEN $2::bigint IS NULL THEN 'idle' ELSE 'mounted' END,current_platform_id=$2,assigned_user_id=NULL,borrower_name='',borrower_contact='',updated_at=now() WHERE code=ANY($1::text[])`,[input.assetCodes,platformId]);
      }else{
        await client.query(`UPDATE lab_assets SET storage_location=$2,updated_at=now() WHERE code=ANY($1::text[])`,[input.assetCodes,input.value]);
      }
      await audit(client,{actorId,action:`lab-assets.asset.batch.${input.action}`,targetType:"lab_assets",targetId:"batch",revision,detail:{assetCodes:input.assetCodes,value:input.value}});
      return revision;
    }),
    validateAssetImport:(input:AssetImportInput)=>transaction(async(client)=>{const current=await client.query<{revision:string}>(`SELECT revision::text revision FROM site_content_revisions WHERE module_key='lab-assets'`);if(current.rows[0]?.revision!==input.expectedRevision)throw new RevisionConflictError();return validateImportRows(client,input.rows,Boolean(input.createMissingDeviceTypes));}),
    commitAssetImport:(input:AssetImportInput,actorId:string)=>transaction(async(client)=>{const revision=await claimRevision(client,input.expectedRevision);await client.query(`SELECT pg_advisory_xact_lock(hashtext('lab-assets-import'))`);const procurementIds=[...new Set(input.rows.map((row)=>row.procurementRequestId).filter((id):id is string=>Boolean(id)))];if(procurementIds.length){const sources=await client.query<{id:string}>(`SELECT id FROM procurement_requests WHERE id=ANY($1::uuid[]) AND status IN ('received','closed') FOR SHARE`,[procurementIds]);if(sources.rows.length!==procurementIds.length)throw new ConflictError("采购来源不存在或尚未确认到货");}if(input.createMissingDeviceTypes){const requested=[...new Set(input.rows.map((row)=>row.deviceTypeCode))];await client.query(`INSERT INTO lab_device_types(code,name) SELECT code,code FROM unnest($1::text[]) code ON CONFLICT DO NOTHING`,[requested]);}const report=await validateImportRows(client,input.rows,Boolean(input.createMissingDeviceTypes));if(report.summary.errors)throw new ImportValidationError(report);for(const row of input.rows){await writeAsset(client,{code:row.code,deviceTypeCode:row.deviceTypeCode,model:row.model,name:{zh:row.nameZh,en:row.nameEn},description:{zh:row.descriptionZh,en:""},vendorSerial:row.vendorSerial,status:row.status as LabAsset["status"],currentPlatformCode:row.status==="mounted"?row.platformCode:null,assignedUserId:null,borrowerName:"",borrowerContact:"",storageLocation:row.storageLocation||null},undefined,row.procurementRequestId);}await audit(client,{actorId,action:"lab-assets.asset.import",targetType:"lab_assets",targetId:"batch",revision,detail:{count:input.rows.length,procurementRequestIds:procurementIds,createdMissingDeviceTypes:Boolean(input.createMissingDeviceTypes)}});return revision;}),
    updateAsset:(code:string,item:LabAsset,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.asset.update",targetType:"lab_assets",targetId:code},async(client)=>{if(await duplicate(client,"lab_assets",item.code,code))throw new ConflictError("Asset code already exists");await writeAsset(client,item,code);}),
    deleteAsset:(code:string,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.asset.delete",targetType:"lab_assets",targetId:code},async(client)=>requireAffected(await client.query(`DELETE FROM lab_assets WHERE code=$1`,[code]),"Asset")),
    createPlatform:(item:LabPlatform,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.platform.create",targetType:"lab_platforms",targetId:item.code},async(client)=>{if(await duplicate(client,"lab_platforms",item.code))throw new ConflictError("Platform code already exists");const typeId=await findId(client,"lab_platform_types",item.typeCode);const created=await client.query<{id:string}>(`INSERT INTO lab_platforms(code,type_id,name_zh,name_en,description_zh,description_en,status,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,0) RETURNING id`,[item.code,typeId,item.name.zh,item.name.en,item.description.zh,item.description.en,item.status]);await syncPlatformAssets(client,created.rows[0].id,item.assetCodes);}),
    updatePlatform:(code:string,item:LabPlatform,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.platform.update",targetType:"lab_platforms",targetId:code},async(client)=>{if(await duplicate(client,"lab_platforms",item.code,code))throw new ConflictError("Platform code already exists");const typeId=await findId(client,"lab_platform_types",item.typeCode);const updated=await client.query<{id:string}>(`UPDATE lab_platforms SET code=$1,type_id=$2,name_zh=$3,name_en=$4,description_zh=$5,description_en=$6,status=$7,updated_at=now() WHERE code=$8 RETURNING id`,[item.code,typeId,item.name.zh,item.name.en,item.description.zh,item.description.en,item.status,code]);requireAffected(updated,"Platform");await syncPlatformAssets(client,updated.rows[0].id,item.assetCodes);}),
    deletePlatform:(code:string,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.platform.delete",targetType:"lab_platforms",targetId:code},async(client)=>{const id=await findId(client,"lab_platforms",code);await client.query(`UPDATE lab_assets SET current_platform_id=NULL,status='idle',updated_at=now() WHERE current_platform_id=$1`,[id]);requireAffected(await client.query(`DELETE FROM lab_platforms WHERE id=$1`,[id]),"Platform");}),
    submitUsageRequest:(assetCode:string,reason:string,revision:string,actorId:string)=>transaction(async(client)=>{const nextRevision=await claimRevision(client,revision);const asset=await client.query<{id:string;status:string}>(`SELECT id,status FROM lab_assets WHERE code=$1 FOR UPDATE`,[assetCode]);if(!asset.rowCount)throw new ConflictError("Asset not found");const existing=await client.query(`SELECT 1 FROM lab_asset_usage_requests WHERE asset_id=$1 AND requester_id=$2 AND status='pending' LIMIT 1`,[asset.rows[0].id,actorId]);if(existing.rowCount)throw new ConflictError("你已经提交过该设备的待审批申请");const autoApproved=asset.rows[0].status==="idle";const created=await client.query<{id:string}>(`INSERT INTO lab_asset_usage_requests(asset_id,requester_id,status,reason,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $3='approved' THEN now() ELSE NULL END) RETURNING id`,[asset.rows[0].id,actorId,autoApproved?"approved":"pending",reason,autoApproved?actorId:null]);if(autoApproved)await client.query(`UPDATE lab_assets SET status='in_use',assigned_user_id=$2,current_platform_id=NULL,borrower_name='',borrower_contact='',updated_at=now() WHERE id=$1`,[asset.rows[0].id,actorId]);await audit(client,{actorId,action:"lab-assets.usage-request.create",targetType:"lab_asset_usage_requests",targetId:created.rows[0].id,revision:nextRevision,detail:{autoApproved}});return{revision:nextRevision,id:created.rows[0].id,status:autoApproved?"approved":"pending"};}),
    reviewUsageRequest:(id:string,input:UsageReview,revision:string,actorId:string)=>transaction(async(client)=>{const nextRevision=await claimRevision(client,revision);const request=await client.query<{asset_id:string;status:string;requester_id:string}>(`SELECT asset_id,status,requester_id FROM lab_asset_usage_requests WHERE id=$1 FOR UPDATE`,[id]);if(!request.rowCount)throw new ConflictError("Usage request not found");if(request.rows[0].status!=="pending")throw new ConflictError("Usage request has already been processed");if(input.action==="approve"){await client.query(`SELECT id FROM lab_assets WHERE id=$1 FOR UPDATE`,[request.rows[0].asset_id]);await client.query(`UPDATE lab_assets SET status='in_use',assigned_user_id=$2,current_platform_id=NULL,borrower_name='',borrower_contact='',updated_at=now() WHERE id=$1`,[request.rows[0].asset_id,request.rows[0].requester_id]);await client.query(`UPDATE lab_asset_usage_requests SET status='rejected',review_note='设备已分配给其他成员',reviewed_by=$3,reviewed_at=now(),updated_at=now() WHERE asset_id=$1 AND status='pending' AND id<>$2`,[request.rows[0].asset_id,id,actorId]);}await client.query(`UPDATE lab_asset_usage_requests SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE id=$1`,[id,input.action==="approve"?"approved":"rejected",input.note,actorId]);await audit(client,{actorId,action:`lab-assets.usage-request.${input.action}`,targetType:"lab_asset_usage_requests",targetId:id,revision:nextRevision});return{revision:nextRevision,status:input.action==="approve"?"approved":"rejected"};}),
    updatePage:(page:unknown,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.page.update",targetType:"page_content",targetId:"lab_assets_page"},async(client)=>{await client.query(`INSERT INTO page_content(page_key,content_json,updated_at) VALUES('lab_assets_page',$1::jsonb,now()) ON CONFLICT(page_key) DO UPDATE SET content_json=EXCLUDED.content_json,updated_at=now()`,[JSON.stringify(page)]);}),
    // Legacy note endpoints remain available during the console transition.
    addAssetNote:(code:string,note:LabNote,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.asset-note.create",targetType:"lab_asset_notes",targetId:code},async(client)=>requireAffected(await client.query(`INSERT INTO lab_asset_notes(asset_id,sort_order,content_zh,content_en) SELECT id,$1,$2,$3 FROM lab_assets WHERE code=$4`,[note.sortOrder,note.content.zh,note.content.en,code]),"Asset")),
    addPlatformNote:(code:string,note:LabNote,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.platform-note.create",targetType:"lab_platform_notes",targetId:code},async(client)=>requireAffected(await client.query(`INSERT INTO lab_platform_notes(platform_id,sort_order,content_zh,content_en) SELECT id,$1,$2,$3 FROM lab_platforms WHERE code=$4`,[note.sortOrder,note.content.zh,note.content.en,code]),"Platform")),
    deleteAssetNote:(code:string,noteId:string,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.asset-note.delete",targetType:"lab_asset_notes",targetId:noteId},async(client)=>requireAffected(await client.query(`DELETE FROM lab_asset_notes n USING lab_assets a WHERE n.id=$1::bigint AND n.asset_id=a.id AND a.code=$2`,[noteId,code]),"Asset note")),
    deletePlatformNote:(code:string,noteId:string,revision:string,actorId:string)=>mutate({expectedRevision:revision,actorId,action:"lab-assets.platform-note.delete",targetType:"lab_platform_notes",targetId:noteId},async(client)=>requireAffected(await client.query(`DELETE FROM lab_platform_notes n USING lab_platforms p WHERE n.id=$1::bigint AND n.platform_id=p.id AND p.code=$2`,[noteId,code]),"Platform note")),
  };
}

export type LabAssetsService=ReturnType<typeof createLabAssetsService>;
