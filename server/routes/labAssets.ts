import { Router, type Request, type RequestHandler } from "express";
import { z, ZodError } from "zod";
import { requireLogin } from "../middleware/auth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { requirePasswordChanged } from "../middleware/requirePasswordChanged.js";
import { createRequireSameOrigin } from "../middleware/requireSameOrigin.js";
import { ConflictError, RevisionConflictError, type LabAssetsService } from "../services/lab-assets/labAssetsService.js";
import {
  assetRequestSchema,codeParamSchema,deleteRequestSchema,deviceTypeRequestSchema,noteIdParamSchema,noteRequestSchema,pageRequestSchema,
  platformRequestSchema,platformTypeRequestSchema,requestIdParamSchema,usageRequestSchema,usageReviewSchema,
} from "../services/lab-assets/schemas.js";

type Options={authMiddleware:RequestHandler;service:LabAssetsService;trustProxy:boolean};
export function createLabAssetsRouter({authMiddleware,service,trustProxy}:Options){
  const router=Router(),sameOrigin=createRequireSameOrigin({trustProxy});
  const canRead=(request:Request)=>{const permissions=request.authUser?.permissions??[];return permissions.includes("lab_assets.read")||permissions.includes("lab_assets.write")};
  const canManage=(request:Request)=>(request.authUser?.permissions??[]).includes("lab_assets.write");
  const code=(request:Request)=>codeParamSchema.parse(request.params.code),noteId=(request:Request)=>noteIdParamSchema.parse(request.params.noteId),actorId=(request:Request)=>request.authUser!.id;
  const handle=(response:Parameters<RequestHandler>[1],next:Parameters<RequestHandler>[2],error:unknown)=>{if(error instanceof ZodError)response.status(400).json({error:"Validation failed",issues:error.issues});else if(error instanceof ConflictError||error instanceof RevisionConflictError)response.status(409).json({error:error.message});else next(error)};
  router.use("/api/lab-assets",authMiddleware,requireLogin,requirePasswordChanged);
  router.get("/api/lab-assets",async(request,response,next)=>{try{if(!canRead(request)){response.status(403).json({error:"Permission denied"});return;}response.json(await service.getSnapshot({id:actorId(request),canManage:canManage(request)}));}catch(error){handle(response,next,error)}});
  const mutation=<T extends z.ZodTypeAny>(schema:T,invoke:(request:Request,body:z.output<T>)=>Promise<string>):RequestHandler[]=>[requirePermission("lab_assets.write"),sameOrigin,async(request,response,next)=>{try{const body=schema.parse(request.body);response.json({revision:await invoke(request,body)});}catch(error){handle(response,next,error)}}];
  router.put("/api/lab-assets/page",...mutation(pageRequestSchema,(r,b)=>service.updatePage(b.page,b.expectedRevision,actorId(r))));
  router.post("/api/lab-assets/platform-types",...mutation(platformTypeRequestSchema,(r,b)=>service.createPlatformType(b,b.expectedRevision,actorId(r))));
  router.post("/api/lab-assets/device-types",...mutation(deviceTypeRequestSchema,(r,b)=>service.createDeviceType(b,b.expectedRevision,actorId(r))));
  router.post("/api/lab-assets/platforms",...mutation(platformRequestSchema,(r,b)=>service.createPlatform(b,b.expectedRevision,actorId(r))));
  router.put("/api/lab-assets/platforms/:code",...mutation(platformRequestSchema,(r,b)=>service.updatePlatform(code(r),b,b.expectedRevision,actorId(r))));
  router.delete("/api/lab-assets/platforms/:code",...mutation(deleteRequestSchema,(r,b)=>service.deletePlatform(code(r),b.expectedRevision,actorId(r))));
  router.post("/api/lab-assets/assets",...mutation(assetRequestSchema,(r,b)=>service.createAsset(b,b.expectedRevision,actorId(r))));
  router.put("/api/lab-assets/assets/:code",...mutation(assetRequestSchema,(r,b)=>service.updateAsset(code(r),b,b.expectedRevision,actorId(r))));
  router.delete("/api/lab-assets/assets/:code",...mutation(deleteRequestSchema,(r,b)=>service.deleteAsset(code(r),b.expectedRevision,actorId(r))));
  router.post("/api/lab-assets/usage-requests",sameOrigin,async(request,response,next)=>{try{if(!canRead(request)){response.status(403).json({error:"Permission denied"});return;}const body=usageRequestSchema.parse(request.body);response.json(await service.submitUsageRequest(body.assetCode,body.reason,body.expectedRevision,actorId(request)));}catch(error){handle(response,next,error)}});
  router.post("/api/lab-assets/usage-requests/:id/review",requirePermission("lab_assets.write"),sameOrigin,async(request,response,next)=>{try{const body=usageReviewSchema.parse(request.body);response.json(await service.reviewUsageRequest(requestIdParamSchema.parse(request.params.id),body,body.expectedRevision,actorId(request)));}catch(error){handle(response,next,error)}});
  // Compatibility endpoints for previous clients; the new console stores remarks directly on records.
  router.post("/api/lab-assets/platforms/:code/notes",...mutation(noteRequestSchema,(r,b)=>service.addPlatformNote(code(r),b,b.expectedRevision,actorId(r))));
  router.delete("/api/lab-assets/platforms/:code/notes/:noteId",...mutation(deleteRequestSchema,(r,b)=>service.deletePlatformNote(code(r),noteId(r),b.expectedRevision,actorId(r))));
  router.post("/api/lab-assets/assets/:code/notes",...mutation(noteRequestSchema,(r,b)=>service.addAssetNote(code(r),b,b.expectedRevision,actorId(r))));
  router.delete("/api/lab-assets/assets/:code/notes/:noteId",...mutation(deleteRequestSchema,(r,b)=>service.deleteAssetNote(code(r),noteId(r),b.expectedRevision,actorId(r))));
  return router;
}
