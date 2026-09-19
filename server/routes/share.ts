import { Router } from "express";
import { getDb } from "../db/database.js";
import { publicToken } from "../utils/publicLinks.js";
export const shareRouter=Router();
shareRouter.get("/pitch/:leadId",(req,res)=>{const lead=getDb().prepare("SELECT id FROM leads WHERE id=?").get(req.params.leadId);if(!lead)return res.status(404).json({error:"Not found"});const share=publicToken(req.user!.tenantId,"pitch",req.params.leadId);res.json({url:`/pitch/${encodeURIComponent(req.params.leadId)}?share=${encodeURIComponent(share)}`});});
shareRouter.get("/portal/:clientId",(req,res)=>{const client=getDb().prepare("SELECT id FROM seo_clients WHERE id=?").get(req.params.clientId);if(!client)return res.status(404).json({error:"Not found"});const share=publicToken(req.user!.tenantId,"portal",req.params.clientId);res.json({url:`/portal/${encodeURIComponent(req.params.clientId)}?share=${encodeURIComponent(share)}`});});