#!/usr/bin/env node
// Local persistence server for tod_prompts.json
// Listens on localhost and writes updated JSON to repo, then runs git add/commit/push.

const http = require('http');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'persist-config.json');
let config = { allowedSSID: null, allowedGatewayMac: null, allowedSubnets: [], requireLocalOnly: true, repoPath: path.join(__dirname, '..'), token: 'changeme', branch: 'main' };
try{ const raw = fs.readFileSync(CONFIG_PATH,'utf8'); const c = JSON.parse(raw); config = Object.assign(config, c); }catch(e){ console.warn('No config found at', CONFIG_PATH, 'using defaults'); }

const PORT = config.port || 34000;
// Bind to all interfaces so mobile devices on the LAN can reach the server
const HOST = '0.0.0.0';

function getCurrentSSID(callback){
  // Windows
  if(process.platform === 'win32'){
    exec('netsh wlan show interfaces', (err, stdout, stderr) => {
      if(err) return callback(null);
      const m = stdout.match(/\bSSID\s*:\s*(.+)\r?\n/i);
      if(m) return callback(m[1].trim());
      return callback(null);
    });
    return;
  }
  // MacOS
  if(process.platform === 'darwin'){
    exec('/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I', (err, stdout) => {
      if(err) return callback(null);
      const m = stdout.match(/\s*SSID:\s*(.+)/i);
      if(m) return callback(m[1].trim());
      return callback(null);
    });
    return;
  }
  // Linux (nmcli)
  exec("nmcli -t -f ACTIVE,SSID dev wifi | egrep '^yes' | cut -d: -f2", (err, stdout) => {
    if(err) return callback(null);
    const ssid = stdout.split('\n')[0].trim();
    return callback(ssid || null);
  });
}

const os = require('os');

function normalizeIp(ip){
  if(!ip) return null;
  if(ip.startsWith('::ffff:')) return ip.split('::ffff:')[1];
  if(ip === '::1') return '127.0.0.1';
  return ip;
}

function isPrivateIP(ip){
  ip = normalizeIp(ip);
  if(!ip) return false;
  const parts = ip.split('.').map(Number);
  if(parts.length !== 4 || parts.some(isNaN)) return false;
  const [a,b] = parts;
  if(a === 10) return true;
  if(a === 172 && b >= 16 && b <= 31) return true;
  if(a === 192 && b === 168) return true;
  if(a === 127) return true;
  return false;
}

function cidrMatch(ip, cidr){
  ip = normalizeIp(ip);
  const [range, bits] = cidr.split('/');
  const ipNum = ipToInt(ip);
  const rangeNum = ipToInt(range);
  const mask = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

function ipToInt(ip){
  const p = ip.split('.').map(Number);
  return ((p[0]<<24)>>>0) + (p[1]<<16) + (p[2]<<8) + p[3];
}

function getDefaultGatewayIP(callback){
  if(process.platform === 'linux'){
    exec("ip route | awk '/default/ {print $3; exit}'", (err, stdout)=>{ if(err) return callback(null); callback((stdout||'').trim() || null); });
    return;
  }
  if(process.platform === 'darwin'){
    exec("route -n get default | awk '/gateway:/{print $2; exit}'", (err, stdout)=>{ if(err) return callback(null); callback((stdout||'').trim() || null); });
    return;
  }
  if(process.platform === 'win32'){
    exec('powershell -Command "(Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Select-Object -First 1).NextHop"', (err, stdout)=>{ if(err) return callback(null); callback((stdout||'').trim() || null); });
    return;
  }
  callback(null);
}

function getArpMacForIp(ip, callback){
  if(!ip) return callback(null);
  exec('arp -a', (err, stdout)=>{
    if(err) return callback(null);
    const out = stdout.split(/\r?\n/);
    for(const line of out){
      if(line.indexOf(ip) !== -1){
        const m = line.match(/(([0-9a-f]{2}-){5}[0-9a-f]{2})|(([0-9a-f]{2}:){5}[0-9a-f]{2})/i);
        if(m) return callback(m[0].replace(/-/g, ':').toLowerCase());
      }
    }
    return callback(null);
  });
}

function getServerIPs(){
  const nets = os.networkInterfaces();
  const ips = [];
  Object.values(nets).forEach(list => {
    list.forEach(i => { if(i.family === 'IPv4' && !i.internal) ips.push(i.address); });
  });
  return ips;
}

function writeAndCommit(jsonObj, msg, res){
  const target = path.join(config.repoPath, 'data', 'tod_prompts.json');
  const dataStr = JSON.stringify(jsonObj, null, 2);
  fs.writeFile(target, dataStr, 'utf8', (err) => {
    if(err){ console.error('Failed to write file', err); res.writeHead(500); res.end(JSON.stringify({ ok:false, error: 'write_failed' })); return; }
    // run git add/commit/push
    const commitMsg = msg || 'Update tod_prompts.json via local persist server';
    const cmds = [
      `cd "${config.repoPath}"`,
      `git add data/tod_prompts.json`,
      `git commit -m "${commitMsg.replace(/\"/g,'\\\"')}" || true`,
      `git push origin ${config.branch} || true`
    ].join(' && ');
    exec(cmds, { maxBuffer: 1024*1024 }, (err, stdout, stderr) => {
      if(err) console.error('Git cmds error', err);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok:true, wrote: target, stdout: stdout, stderr: stderr }));
    });
  });
}

const server = http.createServer((req,res)=>{
  // Allow CORS from anywhere for localhost use
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Persist-Token');
  if(req.method === 'OPTIONS'){ res.writeHead(204); res.end(); return; }
  // Support a GET probe to fetch a token if the requesting client passes local network checks
  if(req.method === 'GET' && req.url === '/fetch-token'){
    const remote = normalizeIp(req.socket.remoteAddress || req.connection.remoteAddress);
    if(config.requireLocalOnly && !isPrivateIP(remote)){ res.writeHead(403); res.end(JSON.stringify({ ok:false, error:'remote_not_allowed', remote })); return; }
    // Check SSID first
    if(config.allowedSSID){
      getCurrentSSID((ssid)=>{
        if(!ssid){ res.writeHead(400); res.end(JSON.stringify({ ok:false, error:'no_ssid_detected' })); return; }
        if(ssid === config.allowedSSID){ res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({ ok:true, token: config.token })); return; }
        res.writeHead(403); res.end(JSON.stringify({ ok:false, error:'unauthorized_ssid', ssid })); return;
      });
      return;
    }
    if(config.allowedGatewayMac){
      getDefaultGatewayIP((gwIp)=>{
        if(!gwIp){ res.writeHead(400); res.end(JSON.stringify({ ok:false, error:'no_gateway_detected' })); return; }
        getArpMacForIp(gwIp, (mac)=>{
          if(!mac){ res.writeHead(400); res.end(JSON.stringify({ ok:false, error:'no_gateway_mac' })); return; }
          if(mac.toLowerCase() === String(config.allowedGatewayMac).toLowerCase()){
            res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({ ok:true, token: config.token })); return;
          }
          res.writeHead(403); res.end(JSON.stringify({ ok:false, error:'unauthorized_gateway', mac })); return;
        });
      });
      return;
    }
    if(Array.isArray(config.allowedSubnets) && config.allowedSubnets.length){
      const ips = getServerIPs();
      let ok = false;
      for(const myip of ips){
        for(const cidr of config.allowedSubnets){ if(cidrMatch(myip, cidr)) { ok = true; break; } if(ok) break; }
      }
      if(ok){ res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({ ok:true, token: config.token })); return; }
      res.writeHead(403); res.end(JSON.stringify({ ok:false, error:'unauthorized_subnet', serverIPs: ips })); return;
    }
    // No network restrictions configured — return token to local client
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ ok:true, token: config.token }));
    return;
  }
  if(req.method !== 'POST' || req.url !== '/persist-tod'){
    res.writeHead(404); res.end('Not found'); return;
  }
  const token = req.headers['x-persist-token'] || req.headers['x-persist-token'.toLowerCase()];
  if(!token || token !== config.token){ res.writeHead(403); res.end(JSON.stringify({ ok:false, error:'bad_token' })); return; }
  // Ensure request is local/private if configured
  const remote = normalizeIp(req.socket.remoteAddress || req.connection.remoteAddress);
  if(config.requireLocalOnly && !isPrivateIP(remote)){ res.writeHead(403); res.end(JSON.stringify({ ok:false, error:'remote_not_allowed', remote })); return; }
  // collect body
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', ()=>{
    try{
      const payload = JSON.parse(body);
      // optional commit message
      const msg = payload.commitMessage || 'Update tod_prompts via local server';
      // Evaluate network checks: prefer SSID, then gateway MAC, then subnet rules
      if(config.allowedSSID){
        getCurrentSSID((ssid)=>{
          if(!ssid){ res.writeHead(400); res.end(JSON.stringify({ ok:false, error:'no_ssid_detected' })); return; }
          if(ssid === config.allowedSSID){ writeAndCommit(payload.todPrompts, msg, res); return; }
          res.writeHead(403); res.end(JSON.stringify({ ok:false, error:'unauthorized_ssid', ssid })); return;
        });
        return;
      }
      if(config.allowedGatewayMac){
        getDefaultGatewayIP((gwIp)=>{
          if(!gwIp){ res.writeHead(400); res.end(JSON.stringify({ ok:false, error:'no_gateway_detected' })); return; }
          getArpMacForIp(gwIp, (mac)=>{
            if(!mac){ res.writeHead(400); res.end(JSON.stringify({ ok:false, error:'no_gateway_mac' })); return; }
            if(mac.toLowerCase() === String(config.allowedGatewayMac).toLowerCase()){
              writeAndCommit(payload.todPrompts, msg, res); return;
            }
            res.writeHead(403); res.end(JSON.stringify({ ok:false, error:'unauthorized_gateway', mac })); return;
          });
        });
        return;
      }
      if(Array.isArray(config.allowedSubnets) && config.allowedSubnets.length){
        const ips = getServerIPs();
        let ok = false;
        for(const myip of ips){
          for(const cidr of config.allowedSubnets){ if(cidrMatch(myip, cidr)) { ok = true; break; } if(ok) break; }
        }
        if(ok){ writeAndCommit(payload.todPrompts, msg, res); return; }
        res.writeHead(403); res.end(JSON.stringify({ ok:false, error:'unauthorized_subnet', serverIPs: ips })); return;
      }
      // No network restrictions configured, allow by token+local check
      writeAndCommit(payload.todPrompts, msg, res);
    }catch(e){ console.warn('bad json', e); res.writeHead(400); res.end(JSON.stringify({ ok:false, error:'bad_json' })); }
  });
});

server.listen(PORT, HOST, ()=>{
  const ips = getServerIPs();
  console.log(`Persist server listening on http://${HOST}:${PORT}/persist-tod`);
  if(ips && ips.length){
    ips.forEach(ip=> console.log(`Accessible on LAN: http://${ip}:${PORT}/fetch-token`));
  }
  console.log('Config:', { repoPath: config.repoPath, allowedSSID: config.allowedSSID, branch: config.branch });
});
