import type { Pool, PoolClient } from "pg";
import type { z } from "zod";
import type {
  catalogCategorySchema,
  catalogItemSchema,
  catalogQuerySchema,
  catalogSubcategorySchema,
  createProcurementSchema,
  processingSaveSchema,
  transitionSchema,
} from "./schemas.js";
import { requiredPermissionForTransition, validateTransition, type ProcurementStatus } from "./workflow.js";

type CreateInput = z.input<typeof createProcurementSchema>;
type TransitionInput = z.output<typeof transitionSchema>;
type ProcessingInput = z.output<typeof processingSaveSchema>;
type CatalogQuery = z.output<typeof catalogQuerySchema>;
type CatalogCategoryInput = z.output<typeof catalogCategorySchema>;
type CatalogSubcategoryInput = z.output<typeof catalogSubcategorySchema>;
type CatalogItemInput = z.output<typeof catalogItemSchema>;
type Actor = { id: string; permissions: string[] };
type Dependencies = { now?: () => Date };

export class ProcurementNotFoundError extends Error {}
export class ProcurementAccessError extends Error {}
export class ProcurementConflictError extends Error {}

function mapCatalogWriteError(error: unknown): never {
  if (error && typeof error === "object" && (error as { code?: unknown }).code === "23505") throw new ProcurementConflictError("Catalog code or SKU already exists");
  if (error && typeof error === "object" && (error as { code?: unknown }).code === "23503") throw new ProcurementConflictError("Catalog category still contains items or a referenced resource is unavailable");
  throw error;
}

function requireCatalogManager(actor: Actor) {
  if (!actor.permissions.includes("procurements.purchase")) throw new ProcurementAccessError("Permission denied");
}

function mapCategory(row: Record<string, any>) {
  return { id: row.id, code: row.code, nameZh: row.name_zh, nameEn: row.name_en, descriptionZh: row.description_zh, descriptionEn: row.description_en, sortOrder: row.sort_order, isActive: row.is_active };
}

function mapAttribute(row: Record<string, any>) {
  const values = Array.isArray(row.values) ? [...row.values] : [];
  values.sort(row.value_type === "number" ? (left, right) => Number(left) - Number(right) : (left, right) => String(left).localeCompare(String(right), "zh-CN", { numeric: true }));
  return { id: row.id, subcategoryId: row.subcategory_id, attributeKey: row.attribute_key, labelZh: row.label_zh, labelEn: row.label_en, unit: row.unit, valueType: row.value_type, sortOrder: row.sort_order, isFilterable: row.is_filterable, values };
}

function mapSubcategory(row: Record<string, any>, attributes: Record<string, any>[] = []) {
  return { id: row.id, categoryId: row.category_id, code: row.code, nameZh: row.name_zh, nameEn: row.name_en, descriptionZh: row.description_zh, descriptionEn: row.description_en, sortOrder: row.sort_order, isActive: row.is_active, attributes: attributes.filter((item) => item.subcategory_id === row.id).map(mapAttribute) };
}

function mapCatalogItem(row: Record<string, any>) {
  return {
    id: row.id, categoryId: row.category_id, categoryCode: row.category_code, categoryNameZh: row.category_name_zh,
    subcategoryId: row.subcategory_id, subcategoryCode: row.subcategory_code, subcategoryNameZh: row.subcategory_name_zh,
    sku: row.sku, nameZh: row.name_zh, nameEn: row.name_en, spec: row.spec, specMetadata: row.spec_metadata ?? {},
    unit: row.unit, packSize: Number(row.pack_size), estimatedUnitPrice: row.estimated_unit_price === null ? null : Number(row.estimated_unit_price),
    vendor: row.vendor, url: row.url, keywords: row.keywords ?? [], imageAssetId: row.image_asset_id, imageUrl: row.image_url ?? null, isActive: row.is_active,
  };
}

async function withTransaction<T>(pool: Pick<Pool, "connect">, invoke: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect(); let started = false;
  try { await client.query("BEGIN"); started = true; const result = await invoke(client); await client.query("COMMIT"); started = false; return result; }
  catch (error) { if (started) await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

async function ensureSubcategory(pool: Pick<Pool, "query">, categoryId: string, subcategoryId: string) {
  const result = await pool.query("SELECT 1 FROM procurement_catalog_subcategories WHERE id=$1 AND category_id=$2", [subcategoryId, categoryId]);
  if (!result.rowCount) throw new ProcurementConflictError("二级分类不属于所选一级分类");
}

export function createProcurementService(pool: Pick<Pool, "connect" | "query">, dependencies: Dependencies = {}) {
  const now = dependencies.now ?? (() => new Date());
  return {
    async listCatalog(query: CatalogQuery, actor: Actor) {
      if (query.includeInactive) requireCatalogManager(actor);
      const values: unknown[] = []; const where: string[] = [];
      if (!query.includeInactive) where.push("categories.is_active=true", "subcategories.is_active=true", "items.is_active=true");
      if (query.categoryId) { values.push(query.categoryId); where.push(`items.category_id=$${values.length}`); }
      if (query.subcategoryId) { values.push(query.subcategoryId); where.push(`items.subcategory_id=$${values.length}`); }
      if (query.search) { values.push(`%${query.search}%`); where.push(`(items.name_zh ILIKE $${values.length} OR items.name_en ILIKE $${values.length} OR items.spec ILIKE $${values.length} OR COALESCE(items.sku,'') ILIKE $${values.length} OR array_to_string(items.keywords,' ') ILIKE $${values.length})`); }
      for (const [key, selected] of Object.entries(query.attributes)) {
        values.push(key, selected); const keyParam = values.length - 1, selectedParam = values.length;
        where.push(`((jsonb_typeof(items.spec_metadata->$${keyParam})='array' AND items.spec_metadata->$${keyParam} ?| $${selectedParam}::text[]) OR items.spec_metadata->>$${keyParam}=ANY($${selectedParam}::text[]))`);
      }
      const itemWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const itemValues = [...values, query.limit, query.offset];
      const [categories, subcategories, items, attributeDefinitions, facets] = await Promise.all([
        pool.query(`SELECT * FROM procurement_catalog_categories ${query.includeInactive ? "" : "WHERE is_active=true"} ORDER BY sort_order,name_zh`),
        pool.query(`SELECT * FROM procurement_catalog_subcategories ${query.includeInactive ? "" : "WHERE is_active=true"} ORDER BY category_id,sort_order,name_zh`),
        pool.query(`SELECT items.*,categories.code category_code,categories.name_zh category_name_zh,subcategories.code subcategory_code,subcategories.name_zh subcategory_name_zh,media.url image_url,count(*) OVER()::integer total_count
          FROM procurement_catalog_items items JOIN procurement_catalog_categories categories ON categories.id=items.category_id
          JOIN procurement_catalog_subcategories subcategories ON subcategories.id=items.subcategory_id
          LEFT JOIN media_assets media ON media.id=items.image_asset_id AND media.status='active'
          ${itemWhere} ORDER BY categories.sort_order,subcategories.sort_order,items.name_zh,items.spec,items.sku
          LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, itemValues),
        pool.query(`SELECT definitions.*,'[]'::jsonb values
          FROM procurement_catalog_attribute_definitions definitions
          JOIN procurement_catalog_subcategories subcategories ON subcategories.id=definitions.subcategory_id
          ${query.includeInactive ? "" : "WHERE subcategories.is_active=true"}
          ORDER BY definitions.subcategory_id,definitions.sort_order,definitions.label_zh`),
        query.subcategoryId ? pool.query(`SELECT definitions.*,
            COALESCE(jsonb_agg(DISTINCT flattened.value ORDER BY flattened.value) FILTER(WHERE flattened.value IS NOT NULL),'[]'::jsonb) values
          FROM procurement_catalog_attribute_definitions definitions
          LEFT JOIN procurement_catalog_items facet_items ON facet_items.subcategory_id=definitions.subcategory_id AND (${query.includeInactive ? "true" : "facet_items.is_active=true"})
          LEFT JOIN LATERAL (
            SELECT facet_items.spec_metadata->>definitions.attribute_key value
              WHERE jsonb_typeof(facet_items.spec_metadata->definitions.attribute_key) IS DISTINCT FROM 'array'
            UNION SELECT jsonb_array_elements_text(facet_items.spec_metadata->definitions.attribute_key)
              WHERE jsonb_typeof(facet_items.spec_metadata->definitions.attribute_key)='array'
          ) flattened ON true
          WHERE definitions.subcategory_id=$1 AND definitions.is_filterable=true
          GROUP BY definitions.id HAVING count(flattened.value)>0
          ORDER BY definitions.sort_order,definitions.label_zh`, [query.subcategoryId]) : Promise.resolve({ rows: [] }),
      ]);
      return {
        categories: categories.rows.map(mapCategory),
        subcategories: subcategories.rows.map((row) => mapSubcategory(row, attributeDefinitions.rows)),
        attributes: facets.rows.map(mapAttribute),
        items: items.rows.map(mapCatalogItem),
        total: Number(items.rows[0]?.total_count ?? 0),
        limit: query.limit,
        offset: query.offset,
      };
    },

    async createCatalogCategory(input: CatalogCategoryInput, actor: Actor) {
      requireCatalogManager(actor);
      return withTransaction(pool, async (client) => {
        try {
          const result = await client.query(`INSERT INTO procurement_catalog_categories(code,name_zh,name_en,description_zh,description_en,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [input.code,input.nameZh,input.nameEn,input.descriptionZh,input.descriptionEn,input.sortOrder,input.isActive]);
          await client.query("INSERT INTO procurement_catalog_subcategories(category_id,code,name_zh,name_en,sort_order,is_active) VALUES($1,'other','其他','Other',10000,true)", [result.rows[0].id]);
          await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'procurement.catalog_category.create','procurement_catalog_category',$2,$3::jsonb)", [actor.id,result.rows[0].id,JSON.stringify({ code: input.code })]);
          return mapCategory(result.rows[0]);
        } catch (error) { mapCatalogWriteError(error); }
      });
    },

    async updateCatalogCategory(id: string, input: CatalogCategoryInput, actor: Actor) {
      requireCatalogManager(actor);
      try { const result = await pool.query(`WITH updated AS (UPDATE procurement_catalog_categories SET code=$2,name_zh=$3,name_en=$4,description_zh=$5,description_en=$6,sort_order=$7,is_active=$8,updated_at=$9 WHERE id=$1 RETURNING *),audited AS (INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) SELECT $10,'procurement.catalog_category.update','procurement_catalog_category',id,jsonb_build_object('code',code,'isActive',is_active) FROM updated) SELECT * FROM updated`, [id,input.code,input.nameZh,input.nameEn,input.descriptionZh,input.descriptionEn,input.sortOrder,input.isActive,now(),actor.id]); if (!result.rows[0]) throw new ProcurementNotFoundError("Catalog category not found"); return mapCategory(result.rows[0]); }
      catch (error) { if (error instanceof ProcurementNotFoundError) throw error; mapCatalogWriteError(error); }
    },

    async deleteCatalogCategory(id: string, actor: Actor) {
      requireCatalogManager(actor);
      try { const result = await pool.query(`WITH deleted AS (DELETE FROM procurement_catalog_categories categories WHERE categories.id=$1 AND NOT EXISTS(SELECT 1 FROM procurement_catalog_items WHERE category_id=categories.id) AND NOT EXISTS(SELECT 1 FROM procurement_catalog_subcategories WHERE category_id=categories.id) RETURNING categories.id,categories.code,categories.name_zh),audited AS (INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) SELECT $2,'procurement.catalog_category.delete','procurement_catalog_category',id,jsonb_build_object('code',code,'nameZh',name_zh) FROM deleted) SELECT * FROM deleted`, [id,actor.id]); if (result.rows[0]) return { id: result.rows[0].id }; const existing = await pool.query("SELECT EXISTS(SELECT 1 FROM procurement_catalog_categories WHERE id=$1) exists", [id]); if (!existing.rows[0]?.exists) throw new ProcurementNotFoundError("Catalog category not found"); throw new ProcurementConflictError("请先删除该分类下的二级分类和标准件"); }
      catch (error) { if (error instanceof ProcurementNotFoundError || error instanceof ProcurementConflictError) throw error; mapCatalogWriteError(error); }
    },

    async createCatalogSubcategory(input: CatalogSubcategoryInput, actor: Actor) {
      requireCatalogManager(actor);
      return withTransaction(pool, async (client) => {
        try {
          const created = await client.query(`INSERT INTO procurement_catalog_subcategories(category_id,code,name_zh,name_en,description_zh,description_en,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [input.categoryId,input.code,input.nameZh,input.nameEn,input.descriptionZh,input.descriptionEn,input.sortOrder,input.isActive]);
          for (const attribute of input.attributes) await client.query(`INSERT INTO procurement_catalog_attribute_definitions(subcategory_id,attribute_key,label_zh,label_en,unit,value_type,sort_order,is_filterable) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [created.rows[0].id,attribute.attributeKey,attribute.labelZh,attribute.labelEn,attribute.unit,attribute.valueType,attribute.sortOrder,attribute.isFilterable]);
          await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'procurement.catalog_subcategory.create','procurement_catalog_subcategory',$2,$3::jsonb)", [actor.id,created.rows[0].id,JSON.stringify({ code: input.code })]);
          return mapSubcategory(created.rows[0], input.attributes.map((attribute) => ({ ...attribute, subcategory_id: created.rows[0].id, attribute_key: attribute.attributeKey, label_zh: attribute.labelZh, label_en: attribute.labelEn, value_type: attribute.valueType, sort_order: attribute.sortOrder, is_filterable: attribute.isFilterable })));
        } catch (error) { mapCatalogWriteError(error); }
      });
    },

    async updateCatalogSubcategory(id: string, input: CatalogSubcategoryInput, actor: Actor) {
      requireCatalogManager(actor);
      return withTransaction(pool, async (client) => {
        try {
          const updated = await client.query(`UPDATE procurement_catalog_subcategories SET category_id=$2,code=$3,name_zh=$4,name_en=$5,description_zh=$6,description_en=$7,sort_order=$8,is_active=$9,updated_at=$10 WHERE id=$1 RETURNING *`, [id,input.categoryId,input.code,input.nameZh,input.nameEn,input.descriptionZh,input.descriptionEn,input.sortOrder,input.isActive,now()]);
          if (!updated.rows[0]) throw new ProcurementNotFoundError("Catalog subcategory not found");
          const mismatched = await client.query("SELECT 1 FROM procurement_catalog_items WHERE subcategory_id=$1 AND category_id<>$2 LIMIT 1", [id,input.categoryId]);
          if (mismatched.rowCount) throw new ProcurementConflictError("请先移动该二级分类下的标准件，再更改一级分类");
          await client.query("DELETE FROM procurement_catalog_attribute_definitions WHERE subcategory_id=$1", [id]);
          for (const attribute of input.attributes) await client.query(`INSERT INTO procurement_catalog_attribute_definitions(subcategory_id,attribute_key,label_zh,label_en,unit,value_type,sort_order,is_filterable) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id,attribute.attributeKey,attribute.labelZh,attribute.labelEn,attribute.unit,attribute.valueType,attribute.sortOrder,attribute.isFilterable]);
          await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'procurement.catalog_subcategory.update','procurement_catalog_subcategory',$2,$3::jsonb)", [actor.id,id,JSON.stringify({ code: input.code })]);
          return mapSubcategory(updated.rows[0], input.attributes.map((attribute) => ({ ...attribute, subcategory_id: id, attribute_key: attribute.attributeKey, label_zh: attribute.labelZh, label_en: attribute.labelEn, value_type: attribute.valueType, sort_order: attribute.sortOrder, is_filterable: attribute.isFilterable })));
        } catch (error) { if (error instanceof ProcurementNotFoundError || error instanceof ProcurementConflictError) throw error; mapCatalogWriteError(error); }
      });
    },

    async deleteCatalogSubcategory(id: string, actor: Actor) {
      requireCatalogManager(actor);
      try { const result = await pool.query(`WITH deleted AS (DELETE FROM procurement_catalog_subcategories subcategories WHERE subcategories.id=$1 AND NOT EXISTS(SELECT 1 FROM procurement_catalog_items WHERE subcategory_id=subcategories.id) RETURNING id,code,name_zh),audited AS (INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) SELECT $2,'procurement.catalog_subcategory.delete','procurement_catalog_subcategory',id,jsonb_build_object('code',code,'nameZh',name_zh) FROM deleted) SELECT * FROM deleted`, [id,actor.id]); if (result.rows[0]) return { id: result.rows[0].id }; const existing = await pool.query("SELECT EXISTS(SELECT 1 FROM procurement_catalog_subcategories WHERE id=$1) exists", [id]); if (!existing.rows[0]?.exists) throw new ProcurementNotFoundError("Catalog subcategory not found"); throw new ProcurementConflictError("请先删除或移动该二级分类下的所有标准件"); }
      catch (error) { if (error instanceof ProcurementNotFoundError || error instanceof ProcurementConflictError) throw error; mapCatalogWriteError(error); }
    },

    async createCatalogItem(input: CatalogItemInput, actor: Actor) {
      requireCatalogManager(actor); await ensureSubcategory(pool,input.categoryId,input.subcategoryId);
      try { const result = await pool.query(`WITH created AS (INSERT INTO procurement_catalog_items(category_id,subcategory_id,sku,name_zh,name_en,spec,spec_metadata,unit,pack_size,estimated_unit_price,vendor,url,keywords,image_asset_id,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *),audited AS (INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) SELECT $16,'procurement.catalog_item.create','procurement_catalog_item',id,jsonb_build_object('sku',sku,'nameZh',name_zh) FROM created) SELECT * FROM created`, [input.categoryId,input.subcategoryId,input.sku||null,input.nameZh,input.nameEn,input.spec,input.specMetadata,input.unit,input.packSize,input.estimatedUnitPrice??null,input.vendor??null,input.url??null,input.keywords,input.imageAssetId??null,input.isActive,actor.id]); return mapCatalogItem(result.rows[0]); }
      catch (error) { mapCatalogWriteError(error); }
    },

    async updateCatalogItem(id: string, input: CatalogItemInput, actor: Actor) {
      requireCatalogManager(actor); await ensureSubcategory(pool,input.categoryId,input.subcategoryId);
      try { const result = await pool.query(`WITH updated AS (UPDATE procurement_catalog_items SET category_id=$2,subcategory_id=$3,sku=$4,name_zh=$5,name_en=$6,spec=$7,spec_metadata=$8,unit=$9,pack_size=$10,estimated_unit_price=$11,vendor=$12,url=$13,keywords=$14,image_asset_id=$15,is_active=$16,updated_at=$17 WHERE id=$1 RETURNING *),audited AS (INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) SELECT $18,'procurement.catalog_item.update','procurement_catalog_item',id,jsonb_build_object('sku',sku,'nameZh',name_zh,'isActive',is_active) FROM updated) SELECT * FROM updated`, [id,input.categoryId,input.subcategoryId,input.sku||null,input.nameZh,input.nameEn,input.spec,input.specMetadata,input.unit,input.packSize,input.estimatedUnitPrice??null,input.vendor??null,input.url??null,input.keywords,input.imageAssetId??null,input.isActive,now(),actor.id]); if (!result.rows[0]) throw new ProcurementNotFoundError("Catalog item not found"); return mapCatalogItem(result.rows[0]); }
      catch (error) { if (error instanceof ProcurementNotFoundError) throw error; mapCatalogWriteError(error); }
    },

    async deleteCatalogItem(id: string, actor: Actor) {
      requireCatalogManager(actor); const result = await pool.query(`WITH deleted AS (DELETE FROM procurement_catalog_items WHERE id=$1 RETURNING id,sku,name_zh),audited AS (INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) SELECT $2,'procurement.catalog_item.delete','procurement_catalog_item',id,jsonb_build_object('sku',sku,'nameZh',name_zh) FROM deleted) SELECT * FROM deleted`, [id,actor.id]); if (!result.rows[0]) throw new ProcurementNotFoundError("Catalog item not found"); return { id: result.rows[0].id };
    },

    async listRequests(actor: Actor, scope: "mine" | "all", status?: ProcurementStatus) {
      if (scope === "all" && !actor.permissions.includes("procurements.read_all")) throw new ProcurementAccessError("Permission denied");
      if (scope === "mine" && !actor.permissions.includes("procurements.read_own") && !actor.permissions.includes("procurements.read_all")) throw new ProcurementAccessError("Permission denied");
      const values: unknown[]=[]; const where:string[]=[]; if(scope==="mine"){values.push(actor.id);where.push(`requests.requester_id=$${values.length}`);} if(status){values.push(status);where.push(`requests.status=$${values.length}`);}
      const result=await pool.query(`SELECT requests.*,users.username requester_username,users.display_name requester_name FROM procurement_requests requests JOIN users ON users.id=requests.requester_id ${where.length?`WHERE ${where.join(" AND ")}`:""} ORDER BY requests.created_at DESC`,values);
      return result.rows.map((row:any)=>({id:row.id,requestNo:row.request_no,requesterId:row.requester_id,requesterName:row.requester_name||row.requester_username,title:row.title,reason:row.reason,status:row.status,totalEstimatedAmount:Number(row.total_estimated_amount),createdAt:row.created_at,updatedAt:row.updated_at}));
    },

    async getRequest(id: string, actor: Actor) {
      const result=await pool.query(`SELECT requests.*,users.username requester_username,users.display_name requester_name FROM procurement_requests requests JOIN users ON users.id=requests.requester_id WHERE requests.id=$1`,[id]); const request=result.rows[0]; if(!request)throw new ProcurementNotFoundError("Procurement request not found"); if(request.requester_id!==actor.id&&!actor.permissions.includes("procurements.read_all"))throw new ProcurementAccessError("Permission denied");
      const [items,comments,history]=await Promise.all([pool.query("SELECT * FROM procurement_request_items WHERE request_id=$1 ORDER BY sort_order,id",[id]),pool.query("SELECT comments.*,users.display_name author_name FROM procurement_comments comments JOIN users ON users.id=comments.author_id WHERE request_id=$1 ORDER BY comments.created_at",[id]),pool.query("SELECT history.*,users.display_name actor_name FROM procurement_status_history history JOIN users ON users.id=history.actor_id WHERE request_id=$1 ORDER BY history.created_at",[id])]);
      return {...request,items:items.rows,comments:comments.rows,history:history.rows};
    },

    async createRequest(input: CreateInput, actorId: string) {
      return withTransaction(pool,async(client)=>{const resolvedItems=[] as Array<any>;for(const item of input.items){if(item.sourceType==="catalog"){const result=await client.query(`SELECT items.*,categories.code category_code,categories.name_zh category_name_zh,subcategories.code subcategory_code,subcategories.name_zh subcategory_name_zh,media.url image_url FROM procurement_catalog_items items JOIN procurement_catalog_categories categories ON categories.id=items.category_id JOIN procurement_catalog_subcategories subcategories ON subcategories.id=items.subcategory_id LEFT JOIN media_assets media ON media.id=items.image_asset_id AND media.status='active' WHERE items.id=$1 AND items.is_active=true AND categories.is_active=true AND subcategories.is_active=true FOR SHARE OF items,categories,subcategories`,[item.catalogItemId]);const catalog=result.rows[0];if(!catalog)throw new ProcurementConflictError("Catalog item is unavailable");const price=catalog.estimated_unit_price===null?null:Number(catalog.estimated_unit_price);resolvedItems.push({catalogItemId:catalog.id,itemName:catalog.name_zh,spec:catalog.spec,unit:catalog.unit,quantity:item.quantity,estimatedUnitPrice:price,vendor:catalog.vendor,url:catalog.url,remark:item.remark??null,sourceType:"catalog",snapshot:{id:catalog.id,sku:catalog.sku,categoryCode:catalog.category_code,categoryNameZh:catalog.category_name_zh,subcategoryCode:catalog.subcategory_code,subcategoryNameZh:catalog.subcategory_name_zh,nameZh:catalog.name_zh,nameEn:catalog.name_en,spec:catalog.spec,specMetadata:catalog.spec_metadata,unit:catalog.unit,packSize:Number(catalog.pack_size),estimatedUnitPrice:price,vendor:catalog.vendor,url:catalog.url,imageUrl:catalog.image_url}});}else resolvedItems.push({catalogItemId:null,itemName:item.itemName,spec:item.spec??"",unit:item.unit??"件",quantity:item.quantity,estimatedUnitPrice:item.estimatedUnitPrice??null,vendor:item.vendor??null,url:item.url??null,remark:item.remark??null,sourceType:"custom",snapshot:{}});}const total=resolvedItems.reduce((sum,item)=>sum+Math.round(item.quantity*(item.estimatedUnitPrice??0)*100),0)/100;if(total>9_999_999_999.99)throw new ProcurementConflictError("Total estimated amount exceeds database range");const created=await client.query(`INSERT INTO procurement_requests(request_no,requester_id,title,reason,status,total_estimated_amount,submitted_at) VALUES('PR-'||to_char($1::timestamptz,'YYYYMMDD')||'-'||lpad(nextval('procurement_request_no_seq')::text,6,'0'),$2,$3,$4,'submitted',$5,$1) RETURNING id,request_no`,[now(),actorId,input.title,input.reason,total]);const row=created.rows[0];for(const[index,item]of resolvedItems.entries())await client.query(`INSERT INTO procurement_request_items(request_id,catalog_item_id,item_name,spec,quantity,estimated_unit_price,vendor,url,remark,sort_order,source_type,catalog_snapshot,unit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[row.id,item.catalogItemId,item.itemName,item.spec,item.quantity,item.estimatedUnitPrice,item.vendor,item.url,item.remark,index,item.sourceType,JSON.stringify(item.snapshot),item.unit]);await client.query("INSERT INTO procurement_status_history(request_id,from_status,to_status,actor_id) VALUES($1,'draft','submitted',$2)",[row.id,actorId]);await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'procurement.create','procurement_request',$2,$3)",[actorId,row.id,JSON.stringify({requestNo:row.request_no})]);return{id:row.id,requestNo:row.request_no};});
    },

    async saveProcessing(id: string, input: ProcessingInput, actor: Actor) {
      requireCatalogManager(actor);
      return withTransaction(pool,async(client)=>{const locked=await client.query("SELECT id,status FROM procurement_requests WHERE id=$1 FOR UPDATE",[id]);const request=locked.rows[0];if(!request)throw new ProcurementNotFoundError("Procurement request not found");if(!["submitted","purchasing"].includes(request.status))throw new ProcurementConflictError("当前申请不能编辑采购处理进度");for(const item of input.items){const updated=await client.query(`UPDATE procurement_request_items SET processing_status=$3,rejection_reason=$4,processed_by=CASE WHEN $3='pending' THEN NULL ELSE $5::uuid END,processed_at=CASE WHEN $3='pending' THEN NULL ELSE $6 END WHERE id=$1 AND request_id=$2`,[item.itemId,id,item.status,item.status==="rejected"?item.rejectionReason:null,actor.id,now()]);if(!updated.rowCount)throw new ProcurementConflictError("采购条目不存在或不属于当前申请");}if(request.status==="submitted"){await client.query("UPDATE procurement_requests SET status='purchasing',purchased_by=$2,updated_at=$3 WHERE id=$1",[id,actor.id,now()]);await client.query("INSERT INTO procurement_status_history(request_id,from_status,to_status,actor_id,note) VALUES($1,'submitted','purchasing',$2,'开始逐条处理')",[id,actor.id]);}else await client.query("UPDATE procurement_requests SET updated_at=$2 WHERE id=$1",[id,now()]);await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'procurement.processing.save','procurement_request',$2,$3::jsonb)",[actor.id,id,JSON.stringify({items:input.items.length})]);return{id,status:"purchasing"};});
    },

    async completeProcessing(id: string, actor: Actor) {
      requireCatalogManager(actor);
      return withTransaction(pool,async(client)=>{const locked=await client.query("SELECT id,status FROM procurement_requests WHERE id=$1 FOR UPDATE",[id]);const request=locked.rows[0];if(!request)throw new ProcurementNotFoundError("Procurement request not found");if(!["submitted","purchasing"].includes(request.status))throw new ProcurementConflictError("当前申请不能完成处理");const items=await client.query<{processing_status:string}>("SELECT processing_status FROM procurement_request_items WHERE request_id=$1 FOR UPDATE",[id]);if(!items.rows.length||items.rows.some(item=>item.processing_status==="pending"))throw new ProcurementConflictError("请先处理清单中的全部条目");const purchased=items.rows.some(item=>item.processing_status==="purchased");const next=purchased?"purchased":"closed";await client.query(`UPDATE procurement_requests SET status=$2,purchased_by=$3,purchased_at=CASE WHEN $2='purchased' THEN $4 ELSE purchased_at END,closed_at=CASE WHEN $2='closed' THEN $4 ELSE closed_at END,updated_at=$4 WHERE id=$1`,[id,next,actor.id,now()]);await client.query("INSERT INTO procurement_status_history(request_id,from_status,to_status,actor_id,note) VALUES($1,$2,$3,$4,$5)",[id,request.status,next,actor.id,purchased?"逐条处理完成，包含已购买项目":"全部条目驳回，申请完成"]);await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'procurement.processing.complete','procurement_request',$2,$3::jsonb)",[actor.id,id,JSON.stringify({status:next})]);return{id,status:next};});
    },

    async confirmReceived(id: string, actor: Actor) {
      requireCatalogManager(actor);
      return withTransaction(pool,async(client)=>{const locked=await client.query("SELECT id,status FROM procurement_requests WHERE id=$1 FOR UPDATE",[id]);const request=locked.rows[0];if(!request)throw new ProcurementNotFoundError("Procurement request not found");if(request.status!=="purchased")throw new ProcurementConflictError("只有已下单申请可以确认收货");await client.query("UPDATE procurement_requests SET status='closed',received_at=$2,closed_at=$2,updated_at=$2 WHERE id=$1",[id,now()]);await client.query("INSERT INTO procurement_status_history(request_id,from_status,to_status,actor_id,note) VALUES($1,'purchased','closed',$2,'全部已购条目确认收货')",[id,actor.id]);await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'procurement.received.complete','procurement_request',$2,'{}'::jsonb)",[actor.id,id]);return{id,status:"closed"};});
    },

    async transition(id:string,input:TransitionInput,actor:Actor){return withTransaction(pool,async(client)=>{const locked=await client.query("SELECT id,requester_id,status FROM procurement_requests WHERE id=$1 FOR UPDATE",[id]);const request=locked.rows[0];if(!request)throw new ProcurementNotFoundError("Procurement request not found");if(input.action==="cancel"){if(request.requester_id!==actor.id)throw new ProcurementAccessError("Only the requester can cancel this request");}else{if(request.requester_id===actor.id&&(input.action==="approve"||input.action==="reject"))throw new ProcurementAccessError("Requesters cannot review their own request");if(!actor.permissions.includes(requiredPermissionForTransition(input.action)))throw new ProcurementAccessError("Permission denied");}let next:ProcurementStatus;try{next=validateTransition(request.status as ProcurementStatus,input.action);}catch{throw new ProcurementConflictError("Procurement transition is not allowed");}const timestamps={approved:"reviewed_at",rejected:"reviewed_at",purchased:"purchased_at",received:"received_at",closed:"closed_at"}as const;const timestamp=timestamps[next as keyof typeof timestamps];const actorColumn=next==="approved"||next==="rejected"?"reviewed_by":next==="purchasing"||next==="purchased"?"purchased_by":null;const values:unknown[]=[id,next,now()];if(actorColumn)values.push(actor.id);await client.query(`UPDATE procurement_requests SET status=$2,updated_at=$3${timestamp?`,${timestamp}=$3`:""}${actorColumn?`,${actorColumn}=$4`:""} WHERE id=$1`,values);await client.query("INSERT INTO procurement_status_history(request_id,from_status,to_status,actor_id,note) VALUES($1,$2,$3,$4,$5)",[id,request.status,next,actor.id,input.note||null]);await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,'procurement.transition','procurement_request',$2,$3)",[actor.id,id,JSON.stringify({from:request.status,to:next})]);return{id,status:next};});},

    async addComment(id:string,body:string,actor:Actor){const request=await pool.query("SELECT requester_id FROM procurement_requests WHERE id=$1",[id]);if(!request.rows[0])throw new ProcurementNotFoundError("Procurement request not found");if(request.rows[0].requester_id!==actor.id&&!actor.permissions.includes("procurements.read_all"))throw new ProcurementAccessError("Permission denied");const result=await pool.query("INSERT INTO procurement_comments(request_id,author_id,body) VALUES($1,$2,$3) RETURNING id",[id,actor.id,body]);return{id:result.rows[0].id};},
  };
}

export type ProcurementService=ReturnType<typeof createProcurementService>;
