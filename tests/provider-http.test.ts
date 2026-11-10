import {it,expect,vi,afterEach} from 'vitest';
import {providerText} from '../src/server/provider-http';
afterEach(()=>vi.unstubAllGlobals());
it('surfaces rate limiting without leaking response bodies',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('sensitive upstream body',{status:429})));await expect(providerText('https://example.com')).rejects.toThrow('Provider rate limited');});
it('bounds provider response size',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('1234567890')));await expect(providerText('https://example.com',{},5)).rejects.toThrow('too large');});
