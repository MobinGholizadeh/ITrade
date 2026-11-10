import {z} from 'zod';
import {assetSchema} from '@/domain/market';
import {getDb} from '@/server/db';
import {allowedMutation,json} from '@/server/http';
import {readJsonBody} from '@/server/request-body';
export async function GET(){try{return json({preferences:(await getDb().query('SELECT asset,enabled FROM asset_notification_preferences')).rows});}catch{return json({error:'Preferences unavailable'},503);}}
export async function POST(req:Request){if(!allowedMutation(req))return json({error:'Origin rejected'},403);try{const p=z.object({asset:assetSchema,enabled:z.boolean()}).strict().parse(await readJsonBody(req));await getDb().query('INSERT INTO asset_notification_preferences(asset,enabled) VALUES($1,$2) ON CONFLICT(asset) DO UPDATE SET enabled=$2',[p.asset,p.enabled]);return json({ok:true});}catch{return json({error:'Invalid preference'},400);}}
