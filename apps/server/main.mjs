import {createApplication} from './app.mjs';
// Open previews use a separate in-memory application, never the configured live DB.
const app=process.env.BLENDING_OPEN_PREVIEW==='true'
  ? (await import('./blending-open-preview.mjs')).createOpenBlendingPreview()
  : createApplication();
if(app.config.DEMO_MODE)await import('../../tests/fixtures/prepare.mjs');
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
app.server.listen(port,host,()=>console.log(`MIXXWAVE ${app.config.DEMO_MODE?'DEMO':'PILOT'} listening on ${host}:${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await app.close();process.exit(0);});
