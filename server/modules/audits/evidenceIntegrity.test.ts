import assert from "node:assert/strict";
import test from "node:test";
import { generateNapAudit } from "./napChecker.js";
import { generateReviewSentimentAnalysis } from "./reviewSentiment.js";
import { generateGeoGridAudit } from "./geoGrid.js";

test("NAP report does not invent directory evidence",()=>{const report=generateNapAudit({businessName:"Example"});assert.equal(report.dataSource,"not_checked");assert.equal(report.consistencyScore,null);assert.equal(report.totalDirectoriesChecked,0);assert.ok(report.directories.every(item=>item.status==="not_checked"));});
test("review report does not infer sentiment from rating or count",()=>{const report=generateReviewSentimentAnalysis({businessName:"Example",rating:4.8,reviewCount:100});assert.equal(report.totalReviewsAnalyzed,0);assert.equal(report.sentimentScore,null);assert.deepEqual(report.topPraiseThemes,[]);});
test("geo grid does not generate rankings without live SERP evidence",()=>{const report=generateGeoGridAudit({businessName:"Example",keyword:"plumber near me",city:"Dallas"});assert.equal(report.dataSource,"not_checked");assert.deepEqual(report.points,[]);assert.deepEqual(report.competitors,[]);});