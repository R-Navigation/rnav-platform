import { Router, type RequestHandler } from "express";
import { requireLogin } from "../middleware/auth.js";
import { requirePasswordChanged } from "../middleware/requirePasswordChanged.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { createRequireSameOrigin } from "../middleware/requireSameOrigin.js";
import { MediaError, type MediaService } from "../services/media/mediaService.js";
import { mediaIdSchema, mediaListSchema } from "../services/media/mediaSchemas.js";
import { ZodError } from "zod";
import multer from "multer";

export function createMediaRouter({ authMiddleware, service, trustProxy, maxBytes, publicBaseUrl, pathPrefix }: { authMiddleware: RequestHandler; service: MediaService; trustProxy: boolean; maxBytes: number; publicBaseUrl: string; pathPrefix: string }) {
  const router=Router(); const same=createRequireSameOrigin({trustProxy}); router.use("/api/media",authMiddleware,requireLogin,requirePasswordChanged);
  const upload=multer({storage: multer.memoryStorage(), limits:{fileSize:maxBytes}}).single("file");
  const handle=(error: unknown,response: any,next: any)=>{if(error instanceof ZodError)response.status(400).json({code:"VALIDATION_ERROR",error:"Validation failed",issues:error.issues});else if(error instanceof MediaError)response.status(error.status).json({code:error.code,error:error.message});else next(error);};
  router.get("/api/media",requirePermission("site.media.write"),async(req,res,next)=>{try{res.json({assets:await service.list(mediaListSchema.parse(req.query))});}catch(e){handle(e,res,next);}});
  router.get("/api/media/:id/references",requirePermission("site.media.write"),async(req,res,next)=>{try{res.json(await service.getReferences(mediaIdSchema.parse(req.params.id)));}catch(e){handle(e,res,next);}});
  router.post("/api/media/upload",requirePermission("site.media.write"),same,(req,res,next)=>upload(req,res,async(error)=>{if(error){handle(error,res,next);return;}try{if(!req.is("multipart/form-data"))throw new MediaError("请使用文件上传格式","MEDIA_BODY_INVALID");const file=req.file;if(!file)throw new MediaError("未找到上传文件","MEDIA_BODY_INVALID");res.status(201).json(await service.upload({filename:file.originalname,mimeType:file.mimetype,body:file.buffer,maxBytes,publicBaseUrl,pathPrefix},req.authUser!.id));}catch(e){handle(e,res,next);}}));
  for(const [path,method] of [["recycle","recycle"],["restore","restore"],["delete","permanentDelete"]] as const){router.post(`/api/media/:id/${path}`,requirePermission("site.media.write"),same,async(req,res,next)=>{try{const id=mediaIdSchema.parse(req.params.id);res.json(await (service as any)[method](id,req.authUser!.id)??{ok:true});}catch(e){handle(e,res,next);}});}
  return router;
}
