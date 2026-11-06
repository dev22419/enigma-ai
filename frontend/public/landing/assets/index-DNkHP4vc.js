(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=`#version 300 es
out vec2 v;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); v=p; gl_Position=vec4(p*2.-1.,0.,1.); }`,t=`#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v; out vec4 o;
uniform vec2 uRes, uCell, uGrid;
uniform float uT, uDrop1, uDrop2, uLensOn, uDepth, uFade, uAlarm, uSeal, uFlash, uShow;
uniform vec4 uAgents[5];
uniform vec4 uLens;
uniform vec4 uQuiet[3];
uniform sampler2D uAtlas, uMask, uCipher, uPlain;
uniform ivec2 uPlainSize;

float h(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float h2(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }

vec3 ramp(float b){
  vec3 c=mix(vec3(.0,.05,.03),vec3(.015,.36,.19),smoothstep(.0,.32,b));
  c=mix(c,vec3(.20,.92,.52),smoothstep(.28,.74,b));
  return mix(c,vec3(.90,1.,.94),smoothstep(.82,1.3,b));
}

// A stream of light moving down a column. The glyphs stay put; only the light travels.
float stream(float col,float row,float seed){
  float s=h(col+seed*17.);
  float speed=mix(7.,21.,s*s);
  float period=uGrid.y*(1.15+h(col*1.7+seed)*1.5);
  float head=floor(uT*speed+h(col*3.1+seed)*period*9.);
  float d=mod(head-row,period);
  float len=mix(13.,46.,h(col*5.3+seed));
  if(d>=len) return 0.;
  return pow(1.-d/len,1.7)+(d<1.?.8:0.);
}

float glyphAt(vec2 cell,vec2 f,float code){
  vec2 g=vec2(mod(code-32.,16.),floor((code-32.)/16.));
  return texture(uAtlas,(g+f)/vec2(16.,6.)).r;
}

float cipherChar(vec2 cell){
  float flip=floor(uT*(.25+h2(cell)*.9)+h2(cell+7.)*40.);
  ivec2 t=ivec2(mod(cell.x*61.+flip*37.,256.),mod(cell.y*13.+cell.x*7.+flip*11.,256.));
  return texelFetch(uCipher,t,0).r*255.;
}

float sdBox(vec2 p,vec4 r){
  vec2 c=(r.xy+r.zw)*.5,e=(r.zw-r.xy)*.5,q=abs(p-c)-e;
  return length(max(q,0.))+min(max(q.x,q.y),0.);
}

void main(){
  vec2 px=vec2(v.x,1.-v.y)*uRes;
  vec2 g=px/uCell, cell=floor(g), f=fract(g);
  float col=cell.x,row=cell.y;

  // Headline. Each glyph column of the mask can fall independently.
  float n=h(col*2.3+.7);
  float m1=clamp((abs(uDrop1)-n*.5)/.5,0.,1.); m1*=m1;
  float m2=clamp((abs(uDrop2)-n*.5)/.5,0.,1.); m2*=m2;
  float off1=sign(uDrop1)*m1*uRes.y*(.75+n*.6);
  float off2=sign(uDrop2)*m2*uRes.y*(.75+n*.6);
  vec2 cx=vec2((col+.5)*uCell.x,0.);
  float l1=texture(uMask,vec2(px.x,px.y-off1)/uRes).r;
  float l2=texture(uMask,vec2(px.x,px.y-off2)/uRes).g;
  float keep=h2(cell+floor(uT*9.));
  float solid=l1*(1.-smoothstep(.0,.12,m1))+l2*(1.-smoothstep(.0,.12,m2));
  float loose=l1*smoothstep(.0,.12,m1)*step(keep,.75-m1*.6)+l2*smoothstep(.0,.12,m2)*step(keep,.75-m2*.6);
  solid=clamp(solid,0.,1.)*uShow; loose=clamp(loose,0.,1.)*uShow;

  // Rain.
  float on=step(h(col*9.1),.84);
  float b=max(stream(col,row,1.)*on,stream(col,row,2.)*step(h(col*4.7),.5)*.85);
  b=max(b,.07+h2(cell)*.03);
  // A column that just lost its letter carries that light down the page.
  b+=(m2*(1.-m2)*2.5+m1*(1.-m1)*2.5)*step(.45,n)*.5*smoothstep(uRes.y*.25,uRes.y,px.y);

  // Quiet zones keep copy legible without a panel behind it.
  float quiet=1.;
  for(int i=0;i<3;i++) quiet=min(quiet,mix(.1,1.,smoothstep(0.,uCell.y*5.,sdBox(px,uQuiet[i]))));
  quiet=min(quiet,mix(.14,1.,smoothstep(2.,6.,row)));
  b*=quiet;

  float code=cipherChar(cell);
  float gl=glyphAt(cell,f,code);
  vec3 c=ramp(b)*gl*(.55+min(b,1.)*.8);
  float bloom=gl*smoothstep(.3,1.,b);

  // A dimmer, smaller field behind gives the rain depth.
  if(uDepth>.5){
    vec2 g2=px/(uCell*.62)+vec2(3.3,1.7), c2=floor(g2), f2=fract(g2);
    float b2=stream(c2.x+400.,c2.y,3.)*step(h(c2.x*3.3),.5);
    if(b2>.01){
      float gl2=glyphAt(c2,f2,cipherChar(c2));
      c+=ramp(b2*.5)*gl2*.34*(1.-gl)*quiet;
    }
  }

  // Enclave window: cell-snapped, frayed at the edge, shows the same bytes decrypted.
  vec2 cc=cell+.5;
  float d=min(min(cc.x-uLens.x,uLens.z-cc.x),min(cc.y-uLens.y,uLens.w-cc.y));
  float fray=h2(cell+floor(uT*7.)*.37);
  float inside=uLensOn*step(.0,d+(fray-.8)*2.6);
  if(inside>.5){
    ivec2 pt=ivec2(mod(cell,vec2(uPlainSize)));
    vec2 ps=texelFetch(uPlain,pt,0).rg;
    float pg=glyphAt(cell,f,ps.r*255.);
    vec3 ink=ps.g>.5?vec3(.30,.98,.60):vec3(.93,.92,.86);
    float wash=smoothstep(.0,2.,d);
    c=mix(c*.1,ink*pg,1.)+vec3(.012,.03,.022)*wash;
    bloom=0.;
    solid*=.1; loose*=.1;
  }

  // Opening sequence: the same grid shows exposed documents in red until the seal reaches them.
  if(uAlarm>.5){
    float edge=uSeal+(h(col*6.1)-.5)*9.;
    if(row>edge){
      ivec2 pt=ivec2(mod(cell,vec2(uPlainSize)));
      vec2 ps=texelFetch(uPlain,pt,0).rg;
      float pg=glyphAt(cell,f,ps.r*255.);
      float lit=clamp(b/max(quiet,.1),0.,1.), read=0.;
      for(int i=0;i<5;i++) if(cc.x>uAgents[i].x&&cc.x<uAgents[i].z&&cc.y>uAgents[i].y&&cc.y<uAgents[i].w) read=1.;
      vec3 ink=mix(vec3(.5,.03,.03),vec3(1.,.22,.13),lit);
      if(ps.g>.5) ink=vec3(1.,.66,.52);
      if(read>.5) ink=vec3(1.,.97,.93);
      c=ink*pg*(.5+lit*.6+read*.5)*quiet*quiet+vec3(.2,.008,.008)*read;
      bloom=pg*(lit*.32+step(.5,ps.g)*.3+read*.25)*quiet*quiet;
    }
    float e=exp(-abs(row-edge)*.8);
    c+=vec3(.2,1.,.58)*e*(.28+gl*.9);
    bloom=max(bloom,e*.75);
  }
  c+=vec3(.6,.02,.02)*uFlash;

  // Letters sit over the rain as solid plates with the ciphertext cut into them.
  vec3 paper=vec3(.925,.945,.915);
  vec3 plate=paper*(1.-gl*.2);
  c=mix(c,plate,solid);
  c=mix(c,ramp(.9)*gl,loose);
  bloom=mix(bloom,.05,solid);
  bloom=max(bloom,loose*gl*.8);

  o=vec4(c*uFade,bloom*uFade);
}`,n=`#version 300 es
precision mediump float;
in vec2 v; out vec4 o; uniform sampler2D uTex;
void main(){ vec4 s=texture(uTex,v); o=vec4(s.rgb*s.a,1.); }`,r=`#version 300 es
precision mediump float;
in vec2 v; out vec4 o; uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec3 c=texture(uTex,v).rgb*.227;
  c+=(texture(uTex,v+uDir*1.385).rgb+texture(uTex,v-uDir*1.385).rgb)*.316;
  c+=(texture(uTex,v+uDir*3.231).rgb+texture(uTex,v-uDir*3.231).rgb)*.07;
  o=vec4(c,1.);
}`,i=`#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D uTex, uBloom; uniform float uT; uniform vec2 uRes;
float h2(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
void main(){
  vec3 c=texture(uTex,v).rgb+texture(uBloom,v).rgb*1.15;
  vec2 q=v-.5;
  c*=1.-dot(q,q)*.75;
  c+=vec3(.008,.014,.011);
  c+=(h2(gl_FragCoord.xy+floor(uT*24.)*vec2(13.,7.))-.5)*.016;
  o=vec4(c,1.);
}`;function a(e,t,n){let r=(t,n)=>{let r=e.createShader(t);if(e.shaderSource(r,n),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS))throw Error(e.getShaderInfoLog(r));return r},i=e.createProgram();if(e.attachShader(i,r(e.VERTEX_SHADER,t)),e.attachShader(i,r(e.FRAGMENT_SHADER,n)),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))throw Error(e.getProgramInfoLog(i));let a={},o=e.getProgramParameter(i,e.ACTIVE_UNIFORMS);for(let t=0;t<o;t++){let n=e.getActiveUniform(i,t).name.replace(`[0]`,``);a[n]=e.getUniformLocation(i,n)}return{p:i,u:a}}function o(e,t,n){let r=e.createTexture();e.bindTexture(e.TEXTURE_2D,r),e.texImage2D(e.TEXTURE_2D,0,e.RGBA8,t,n,0,e.RGBA,e.UNSIGNED_BYTE,null),s(e,e.LINEAR);let i=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,i),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,r,0),{tex:r,fbo:i,w:t,h:n}}function s(e,t){e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,t),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}function c(c){let l=c.getContext(`webgl2`,{antialias:!1,alpha:!1,powerPreference:`high-performance`});if(!l)return null;let u=a(l,e,t),d=a(l,e,n),f=a(l,e,r),p=a(l,e,i);l.bindVertexArray(l.createVertexArray());let m={atlas:l.createTexture(),mask:l.createTexture(),cipher:l.createTexture(),plain:l.createTexture()};l.pixelStorei(l.UNPACK_ALIGNMENT,1);let h={scale:1,css:[1,1],cell:[11,19],grid:[1,1],plainSize:[1,1],depth:1,drop1:0,drop2:0,lensOn:0,lens:[0,0,0,0],quiet:Array(12).fill(0),alarm:0,seal:-20,flash:0,show:1,agents:Array(20).fill(-99),fade:1},g=null;function _(e,t){l.activeTexture(l.TEXTURE0+e),l.bindTexture(l.TEXTURE_2D,t)}function v(){let e=document.createElement(`canvas`);e.width=768,e.height=504;let t=e.getContext(`2d`,{willReadFrequently:!0});t.fillStyle=`#000`,t.fillRect(0,0,768,504),t.fillStyle=`#fff`,t.textAlign=`center`,t.textBaseline=`middle`,t.font=`72px "Enigma Mono", monospace`;for(let e=0;e<96;e++)t.fillText(String.fromCharCode(32+e),(e%16+.5)*48,(Math.floor(e/16)+.54)*84);_(0,m.atlas),l.texImage2D(l.TEXTURE_2D,0,l.R8,l.RED,l.UNSIGNED_BYTE,e),s(l,l.LINEAR),l.texParameteri(l.TEXTURE_2D,l.TEXTURE_MIN_FILTER,l.LINEAR_MIPMAP_LINEAR),l.generateMipmap(l.TEXTURE_2D)}function y(e){_(2,m.cipher),l.texImage2D(l.TEXTURE_2D,0,l.R8,256,256,0,l.RED,l.UNSIGNED_BYTE,e),s(l,l.NEAREST)}function b(e,t,n){_(3,m.plain),l.texImage2D(l.TEXTURE_2D,0,l.RG8,t,n,0,l.RG,l.UNSIGNED_BYTE,e),s(l,l.NEAREST),h.plainSize=[t,n]}function x(e){_(1,m.mask),l.texImage2D(l.TEXTURE_2D,0,l.RGBA8,l.RGBA,l.UNSIGNED_BYTE,e),s(l,l.LINEAR)}function S(e,t,n){h.css=[e,t];let r=Math.min(window.devicePixelRatio||1,n);h.scale=r;let i=Math.round(e*r),a=Math.round(t*r);(c.width!==i||c.height!==a)&&(c.width=i,c.height=a);let s=e<720?10:12;h.cell=[s,Math.round(s*1.75)],h.grid=[Math.ceil(e/h.cell[0]),Math.ceil(t/h.cell[1])];let u=e=>{e&&(l.deleteTexture(e.tex),l.deleteFramebuffer(e.fbo))};g&&(u(g.a),u(g.b),u(g.c));let d=Math.max(2,i>>2),f=Math.max(2,a>>2);g={a:o(l,i,a),b:o(l,d,f),c:o(l,d,f)},l.bindFramebuffer(l.FRAMEBUFFER,null)}let C=()=>l.drawArrays(l.TRIANGLES,0,3);function w(e){let t=h.scale;l.bindFramebuffer(l.FRAMEBUFFER,g.a.fbo),l.viewport(0,0,g.a.w,g.a.h),l.useProgram(u.p);let n=u.u;_(0,m.atlas),_(1,m.mask),_(2,m.cipher),_(3,m.plain),l.uniform1i(n.uAtlas,0),l.uniform1i(n.uMask,1),l.uniform1i(n.uCipher,2),l.uniform1i(n.uPlain,3),l.uniform2f(n.uRes,g.a.w,g.a.h),l.uniform2f(n.uCell,h.cell[0]*t,h.cell[1]*t),l.uniform2f(n.uGrid,h.grid[0],h.grid[1]),l.uniform2i(n.uPlainSize,h.plainSize[0],h.plainSize[1]),l.uniform1f(n.uT,e),l.uniform1f(n.uDrop1,h.drop1),l.uniform1f(n.uDrop2,h.drop2),l.uniform1f(n.uLensOn,h.lensOn),l.uniform1f(n.uDepth,h.depth),l.uniform1f(n.uFade,h.fade),l.uniform1f(n.uAlarm,h.alarm),l.uniform1f(n.uSeal,h.seal),l.uniform1f(n.uFlash,h.flash),l.uniform1f(n.uShow,h.show),l.uniform4fv(n.uAgents,h.agents),l.uniform4fv(n.uLens,h.lens),l.uniform4fv(n.uQuiet,h.quiet.map(e=>e*t)),C(),l.useProgram(d.p),l.bindFramebuffer(l.FRAMEBUFFER,g.b.fbo),l.viewport(0,0,g.b.w,g.b.h),_(0,g.a.tex),l.uniform1i(d.u.uTex,0),C(),l.useProgram(f.p),l.uniform1i(f.u.uTex,0);for(let e of[1.4,2.6])l.bindFramebuffer(l.FRAMEBUFFER,g.c.fbo),_(0,g.b.tex),l.uniform2f(f.u.uDir,e/g.b.w,0),C(),l.bindFramebuffer(l.FRAMEBUFFER,g.b.fbo),_(0,g.c.tex),l.uniform2f(f.u.uDir,0,e/g.b.h),C();l.bindFramebuffer(l.FRAMEBUFFER,null),l.viewport(0,0,c.width,c.height),l.useProgram(p.p),_(0,g.a.tex),_(1,g.b.tex),l.uniform1i(p.u.uTex,0),l.uniform1i(p.u.uBloom,1),l.uniform1f(p.u.uT,e),l.uniform2f(p.u.uRes,c.width,c.height),C()}let T=l.getExtension(`WEBGL_debug_renderer_info`);return{state:h,gpu:T?l.getParameter(T.UNMASKED_RENDERER_WEBGL):``,buildAtlas:v,setCipher:y,setPlain:b,setMask:x,resize:S,draw:w}}var l=`MASTER SERVICES AGREEMENT
Between Harbourline Diagnostics Pvt. Ltd. ("Client") and Vantara Clinical Systems LLP ("Provider").
Effective date {14 January 2026}. Governing law: India. Courts of {Mumbai} have exclusive jurisdiction.

1. SERVICES. Provider shall process laboratory records for the Client under each Statement of Work.
2. FEES. Client shall pay {INR 18,40,000} per quarter within 30 days of a valid tax invoice.
3. CONFIDENTIALITY. Each party shall hold the other's records in confidence for {seven years}.
4. PERSONAL DATA. Provider acts as data processor and shall follow documented instructions only.
5. SECURITY. Provider shall report any personal data breach to the Client within {six hours}.
6. AUDIT. Client may audit Provider's controls once per year on fifteen business days' notice.
7. {AUTO-RENEWAL}. This Agreement renews for {24 months} unless notice is given {90 days} before expiry.
8. LIABILITY. Aggregate liability is capped at the fees paid in the preceding {twelve months}.
9. TERMINATION. Either party may terminate for material breach not cured within thirty days.
10. PATIENT RECORDS. Records of {Ward 4B} shall not leave the Client's systems unencrypted.
11. SUBPROCESSORS. Provider shall not appoint a subprocessor without prior written consent.
12. RETURN OF DATA. On termination Provider shall delete all Client data within {30 days}.
`,u=e=>Array.from(e,e=>e.toString(16).padStart(2,`0`)).join(``),d=e=>{let t=``;for(let n=0;n<e.length;n+=8192)t+=String.fromCharCode(...e.subarray(n,n+8192));return btoa(t)};async function f(e){return u(new Uint8Array(await crypto.subtle.digest(`SHA-256`,e)))}var p=4.2,m=8.2,h=8.4,g=10.4,_=[`log-archive`,`human-review`,`training-set`,`vendor-agent`,`legal-hold`],v=`Your data does not stay with one AI.`,y=`What you send can be logged, reviewed, kept for training and passed to other agents and vendors.`,b=`Enigma locks it, reads it in an enclave, then forgets it.`,x=`No copy left for anyone else to read. Only a receipt.`,S=`DISCHARGE SUMMARY  Patient {Meera Iyer}  Age 54  MRN {HD-2291-774}  Ward 4B  Diagnosis {Type 2 diabetes, CKD stage 3}
Attending Dr {R. Nair}  Medication {Metformin 500 mg}  Insurance policy {SH-55120-88}  Next of kin {Arjun Iyer +91 98XXX 41207}
BANK STATEMENT  Account {0049 2210 7781}  IFSC {HDFC0000412}  Holder {Kaveri Exports Pvt Ltd}  Closing balance {INR 4,18,22,960.14}
Credit facility {INR 12 crore}  Covenant breach flagged {Q3 FY26}  Relationship manager {S. Mehta}  Internal risk grade {B-minus}
MASTER SERVICES AGREEMENT  Harbourline Diagnostics  Fees {INR 18,40,000} per quarter  Auto-renewal {24 months}  Notice {90 days}
Liability cap {twelve months of fees}  Termination for breach  Governing law India  Exclusive jurisdiction {Mumbai}
MERGER MEMO  STRICTLY CONFIDENTIAL  Target {Project Heron}  Offer {INR 86 crore}  Board vote {12 March}  Advisers {not to be disclosed}
Employee list attached  Salary band {L5 INR 42 lakh}  PAN {ABCPK1234L}  Passport {Z1234567}  Home address {14 Marine Lines, Mumbai}
SOURCE CODE  const API_KEY = {"sample_key_not_real_0000"}  db.connect({"postgres://admin:sample@10.0.4.12"})  // prod only
LEGAL HOLD NOTICE  Matter {2026-CV-1187}  Privileged and confidential  Witness statement {draft 3}  Settlement floor {INR 2.4 crore}
`.repeat(5);function C(e,t=132){let n=e.trimEnd().split(`
`),r=n.length,i=new Uint8Array(t*r*2);for(let e=0;e<i.length;e+=2)i[e]=32;return n.forEach((e,n)=>{let r=[...e,` `,` `,` `],a=0,o=0,s=n*17%40;for(;a<t;){let e=r[s];s=(s+1)%r.length,e===`{`?o=255:e===`}`?o=0:(i[(n*t+a)*2]=e.charCodeAt(0)<128?e.charCodeAt(0):32,i[(n*t+a)*2+1]=o,a++)}}),{data:i,w:t,h:r}}function w(e){let t=e.match(/ANGLE \([^,]*,\s*([^,]+?)(?:\s*\(0x[0-9A-Fa-f]+\))?\s*(?:Direct3D|OpenGL|Metal|,)/),n=(t?t[1]:e).replace(/\(R\)|\(TM\)/g,``).replace(/\s+/g,` `).trim();return[[`Time zone`,Intl.DateTimeFormat().resolvedOptions().timeZone],[`Language`,navigator.language],[`Screen`,`${screen.width} × ${screen.height}`],[`Graphics`,n],[`Processor`,navigator.hardwareConcurrency?`${navigator.hardwareConcurrency} threads`:``]].filter(e=>e[1])}function T(){if(matchMedia(`(prefers-reduced-motion: reduce)`).matches||new URLSearchParams(location.search).get(`intro`)===`0`||location.hash)return!1;try{if(sessionStorage.getItem(`enigma-intro`))return!1;sessionStorage.setItem(`enigma-intro`,`1`)}catch{}return!0}function E({rain:e,hero:t,start:n,restore:r}){let i=t.querySelector(`.intro`),a=e=>i.querySelector(`[data-i="${e}"]`),o=e.state,s=C(S),c=!1,l=!1,u=!1,d=[],f=[],T=[],E=-1,D=(e,t)=>{let[n,r]=o.grid,i=n<60,a=i?18:26,s=i?1:Math.floor(n*.44),c=s+Math.floor(Math.random()*Math.max(1,n-s-a-1)),l=(i?r*.42:r-5-16)-4,u=4+Math.floor(l*e/_.length);f[e]={x:c,y:u,w:a,h:5,hop:t}};function O(){c&&(c=!1,i.hidden=!0,document.documentElement.classList.remove(`intro-on`),removeEventListener(`keydown`,O),removeEventListener(`wheel`,O),o.alarm=0,o.flash=0,o.fade=1,o.seal=-20,o.agents.fill(-99),r())}i.querySelector(`.intro-skip`).addEventListener(`click`,O);function k(e,n){let r=t.getBoundingClientRect(),i=e=>{let t=e.getBoundingClientRect();return[t.left-r.left,t.top-r.top,t.right-r.left,t.bottom-r.top]};o.quiet=[...i(e),...i(n),-999,-999,-999,-999]}function A(){c||(c=!0,l=!1,u=!1,E=-1,document.documentElement.classList.add(`intro-on`),i.hidden=!1,i.dataset.stage=`dossier`,a(`facts`).replaceChildren(...w(e.gpu).map(([e,t])=>{let n=document.createElement(`div`),r=document.createElement(`dt`),i=document.createElement(`dd`);return r.textContent=e,i.textContent=t,n.append(r,i),n})),a(`bridge`).classList.remove(`is-in`),a(`title`).textContent=v,a(`sub`).textContent=y,a(`flag`).textContent=`Warning`,a(`num`).textContent=`1`,d=_.map(e=>{let t=document.createElement(`span`);return t.className=`intro-tag`,t.hidden=!0,t.textContent=`${e} reading`,t}),a(`tags`).replaceChildren(...d),f=[],T=[],o.show=0,o.fade=0,o.alarm=0,o.seal=-20,o.lensOn=0,o.drop1=o.drop2=-1,e.setPlain(s.data,s.w,s.h),addEventListener(`keydown`,O),addEventListener(`wheel`,O,{passive:!0}),n())}function j(e){e!==E&&(E=e,a(`num`).textContent=e)}function M(e,n){if(a(`secs`).textContent=Math.min(e,p).toFixed(1),e<p)[...a(`facts`).children].forEach((t,n)=>t.classList.toggle(`is-in`,e>.55+n*.38)),a(`bridge`).classList.toggle(`is-in`,e>2.75);else{if(l||(l=!0,i.dataset.stage=`alarm`,o.alarm=1,o.fade=1,o.flash=1,k(a(`alarm`),a(`count`)),t.classList.add(`is-shaking`),setTimeout(()=>t.classList.remove(`is-shaking`),340)),o.flash*=Math.exp(-n*6),_.forEach((t,n)=>{if(e<4.75+n*.42||T[n])return;let r=Math.floor((e-p)/(.52+n*.07));f[n]&&f[n].hop===r||D(n,r);let i=f[n];o.agents.splice(n*4,4,i.x,i.y,i.x+i.w,i.y+i.h),d[n].hidden=!1,d[n].style.transform=`translate(${i.x*o.cell[0]}px, ${(i.y-1)*o.cell[1]}px)`}),e<h){let t=Math.min(1,(e-p-.3)/3.6999999999999993);j(Math.max(1,Math.round(1+22*t*t)))}if(e>=m&&!u&&(u=!0,i.dataset.stage=`safe`,a(`flag`).textContent=`Enigma`,a(`title`).textContent=b,a(`sub`).textContent=x),e>=h){let t=Math.min(1,(e-h)/1.5999999999999996);o.seal=-8+t*t*(3-2*t)*(o.grid[1]+18),_.forEach((e,t)=>{let n=f[t];!n||T[t]||o.seal<n.y||(T[t]=!0,o.agents.splice(t*4,4,-99,-99,-99,-99),d[t].textContent=`${e} locked out`,d[t].classList.add(`is-out`))}),j(Math.round(23*(1-t)))}e>=g&&O()}}function N(){return!c||!l?!1:(k(a(`alarm`),a(`count`)),!0)}return{play:A,update:M,refreshQuiet:N,skip:O}}var D=12,O=1.7,k=2.3,A=4.2,j=e=>1-(1-e)**3,M=e=>Math.min(1,Math.max(0,e));function N(){let e=[];for(let t of l.split(`
`)){if(!t.trim()){e.push(``);continue}let n=``,r=0;for(let i of t.split(` `)){let t=i.replace(/[{}]/g,``).length;r+t+ +!!r>124?(e.push(n),n=i,r=t):(n+=(r?` `:``)+i,r+=t+ +!!r)}e.push(n)}let t=e.length+1,n=new Uint8Array(128*t*2);n.fill(32);for(let e=1;e<n.length;e+=2)n[e]=0;return e.forEach((e,t)=>{let r=0,i=0;for(let a of e){if(a===`{`){i=255;continue}if(a===`}`){i=0;continue}let e=a.charCodeAt(0),o=(t*128+r)*2;n[o]=e>=32&&e<128?e:32,n[o+1]=i,r++}}),{data:n,w:128,h:t}}async function P(){let e=await crypto.subtle.generateKey({name:`AES-GCM`,length:256},!1,[`encrypt`]),t=crypto.getRandomValues(new Uint8Array(12)),n=new TextEncoder().encode(l.repeat(Math.ceil(5e4/l.length))),r=d(new Uint8Array(await crypto.subtle.encrypt({name:`AES-GCM`,iv:t},e,n))),i=new Uint8Array(65536);for(let e=0;e<65536;e++)i[e]=r.charCodeAt(e%r.length);return i}async function F(){let e=document.querySelector(`.hero`),t=e.querySelector(`canvas`),n=matchMedia(`(prefers-reduced-motion: reduce)`).matches,r;try{r=c(t)}catch(e){console.warn(`[enigma]`,e)}if(!r){document.documentElement.classList.remove(`gl`,`intro-pending`);return}await Promise.all([document.fonts.load(`700 100px "Enigma Sans"`),document.fonts.load(`400 40px "Enigma Mono"`)]),r.buildAtlas(),r.setCipher(await P());let i=N();r.setPlain(i.data,i.w,i.h);let a=new Uint8Array(i.data.length).fill(32),o=[...e.querySelectorAll(`h1 [data-line]`)],s=e.querySelector(`.hero-copy`),u=e.querySelector(`.hero-note`),d=e.querySelector(`[data-status]`),p=e.querySelector(`[data-clock]`),m=e.querySelector(`.hero-receipt`),h=e.querySelector(`[data-receipt-hash]`),g=document.createElement(`canvas`),_=await f(new TextEncoder().encode(l));h.textContent=`0x${_.slice(0,24)}…${_.slice(-8)}`;let v=1.5,y=[],b=null,x=()=>{if(b?.refreshQuiet())return;let t=m.getBoundingClientRect(),n=e.getBoundingClientRect(),i=e.classList.contains(`is-erased`);r.state.quiet=[...y,...i?[t.left-n.left,t.top-n.top,t.right-n.left,t.bottom-n.top]:[-999,-999,-999,-999]]};function S(){let n=r.state.scale,i=e.getBoundingClientRect();g.width=t.width,g.height=t.height;let a=g.getContext(`2d`);a.fillStyle=`#000`,a.fillRect(0,0,g.width,g.height),a.globalCompositeOperation=`lighter`,a.textBaseline=`alphabetic`;for(let e of o){let t=getComputedStyle(e),r=e.getBoundingClientRect();a.font=`${t.fontWeight} ${parseFloat(t.fontSize)*n}px "Enigma Sans"`,`letterSpacing`in a&&(a.letterSpacing=`${(parseFloat(t.letterSpacing)||0)*n}px`);let o=a.measureText(`x`).fontBoundingBoxAscent,s=a.measureText(`x`).fontBoundingBoxDescent,c=(r.top-i.top)*n+(r.height*n-(o+s))/2;a.fillStyle=e.dataset.line===`1`?`#f00`:`#0f0`,a.fillText(e.textContent,(r.left-i.left)*n,c+o)}r.setMask(g)}function C(){let t=e.getBoundingClientRect();r.resize(t.width,t.height,v),S();let n=e=>{let n=e.getBoundingClientRect();return[n.left-t.left,n.top-t.top,n.right-t.left,n.bottom-t.top]},i=o.find(e=>e.dataset.line===`2`).getBoundingClientRect();m.style.left=`${i.left-t.left}px`,m.style.top=`${i.top-t.top+i.height*.28}px`,y=[...n(s),...n(u)],x()}let w;new ResizeObserver(()=>{clearTimeout(w),w=setTimeout(C,80)}).observe(e),C();let F={x:0,y:0,tx:0,ty:0,pointer:!1},I=()=>r.state.css[0]<720?[30,9]:[46,11];e.addEventListener(`pointermove`,t=>{if(t.pointerType===`touch`)return;let n=e.getBoundingClientRect();F.tx=(t.clientX-n.left)/r.state.cell[0],F.ty=(t.clientY-n.top)/r.state.cell[1],F.pointer||(F.x=F.tx,F.y=F.ty),F.pointer=!0}),e.addEventListener(`pointerleave`,()=>{F.pointer=!1});function L(e,t){if(!F.pointer){let[t,n]=r.state.grid;F.tx=t*(.43+Math.sin(e*.23)*.07),F.ty=n*(.27+Math.sin(e*.37+1)*.03)}let n=1-Math.exp(-t*(F.pointer?14:2));F.x+=(F.tx-F.x)*n,F.y+=(F.ty-F.y)*n;let[i,a]=I(),o=Math.round(F.x-i/2),s=Math.round(F.y-a/2);r.state.lens=[o,s,o+i,s+a]}if(n){document.documentElement.classList.remove(`intro-pending`),L(2,1),F.x=F.tx,F.y=F.ty,L(2,1),r.state.lensOn=1,p.textContent=``,d.textContent=`Animation paused`;let t=()=>r.draw(19);t(),new ResizeObserver(()=>setTimeout(t,120)).observe(e);return}let R=!0;new IntersectionObserver(([e])=>{R=e.isIntersecting,R&&Q()},{threshold:0}).observe(e),document.addEventListener(`visibilitychange`,()=>{document.hidden||Q()});let z=`form`,B=0,V=0,H=0,U=!1,W=-1,G=0,K=0,q=0,J=e=>{z=e,B=0};function Y(e,t){d.dataset.state=e,d.textContent=t}Y(`live`,`Key in memory`);function X(t,n){B+=n;let o=r.state;if(z===`intro`)b.update(B,n);else if(z===`form`)o.drop1=-(1-j(M(B/O))),o.drop2=-(1-j(M((B-.25)/O))),o.lensOn=M((B-1)/.4),B>1.95&&(o.drop1=o.drop2=0,J(`live`));else if(z===`live`){let t=Math.max(0,Math.ceil(D-B));t!==W&&(W=t,p.textContent=`00:${String(t).padStart(2,`0`)}`),B>=D&&(r.setPlain(a,i.w,i.h),o.lensOn=0,Y(`gone`,`Key destroyed`),e.classList.add(`is-forgotten`),J(`melt`))}else z===`melt`?(o.drop2=M(B/k)**1.5,B>k*.72&&!e.classList.contains(`is-erased`)&&(e.classList.add(`is-erased`),x()),B>k&&(o.drop2=1,J(`gone`))):z===`gone`?B>A&&(e.classList.remove(`is-forgotten`,`is-erased`),x(),P().then(e=>r.setCipher(e)),r.setPlain(i.data,i.w,i.h),Y(`live`,`New key in memory`),W=-1,o.drop1=0,J(`reform`)):z===`reform`&&(o.drop2=-(1-j(M(B/O))),o.lensOn=M((B-.9)/.4),B>1.9&&(o.drop2=0,J(`live`)))}function Z(e){if(!R||document.hidden){U=!1;return}let t=e/1e3,n=Math.min(.25,t-(V||t));if(V=t,H+=n,X(H,n),L(H,n),r.draw(H),K++,t-q>1.5){let e=K/(t-q);K=0,q=t,G=e<42&&e>12?G+1:0,G>=2&&(G=0,r.state.depth?r.state.depth=0:v>.75&&(v=v>1?1:.75,C()))}requestAnimationFrame(Z)}function Q(){U||(U=!0,V=0,q=performance.now()/1e3,K=0,requestAnimationFrame(Z))}r.state.drop1=r.state.drop2=-1,b=E({rain:r,hero:e,start(){e.classList.remove(`is-forgotten`,`is-erased`),W=-1,Y(`live`,`Key in memory`),J(`intro`)},restore(){r.setPlain(i.data,i.w,i.h),x(),r.state.show=1,r.state.drop1=r.state.drop2=-1,J(`form`)}}),T()&&b.play(),document.documentElement.classList.remove(`intro-pending`),document.querySelector(`[data-replay]`)?.addEventListener(`click`,()=>{scrollTo({top:0,behavior:`instant`}),b.play(),Q()}),document.documentElement.classList.add(`gl-ready`),Q()}var I=26214400;function L(){let e=document.querySelector(`.proof-desk`);if(!e)return;let t=t=>e.querySelector(t),n=t(`#proof-file`),r=t(`.drop`),i=[...e.querySelectorAll(`[data-ttl]`)],a={name:t(`[data-v="name"]`),size:t(`[data-v="size"]`),hash:t(`[data-v="hash"]`),cipher:t(`[data-v="cipher"]`),key:t(`[data-v="key"]`),attempt:t(`[data-v="attempt"]`),clock:t(`[data-v="clock"]`),bar:t(`[data-v="bar"]`),body:t(`[data-v="body"]`),verdict:t(`[data-v="verdict"]`)},o=15,s=0,c=null,d=null;i.forEach(e=>e.addEventListener(`click`,()=>{o=Number(e.dataset.ttl),i.forEach(t=>t.setAttribute(`aria-pressed`,String(t===e)))}));function p(t){e.dataset.stage=t}function m(e){let t=e.subarray(0,2600);if(t.includes(0))return null;try{return new TextDecoder(`utf-8`,{fatal:!0}).decode(t)}catch{return null}}function h(e){let t=m(e);return t?t.replace(/[{}]/g,``):`Binary file, first bytes:\n\n${u(e.subarray(0,900)).replace(/(.{2})/g,`$1 `).replace(/(.{72})/g,`$1
`)}`}async function g(t,n){if(clearInterval(s),a.verdict.textContent=``,e.dataset.stage===`receipt`&&c)return v(t,n);let r=await crypto.subtle.generateKey({name:`AES-GCM`,length:256},!1,[`encrypt`,`decrypt`]),i=crypto.getRandomValues(new Uint8Array(12)),l=performance.now(),m=await f(n),g=new Uint8Array(await crypto.subtle.encrypt({name:`AES-GCM`,iv:i},r,n)),y=performance.now()-l;d={key:r,iv:i,cipher:g},a.name.textContent=t,a.size.textContent=`${n.length.toLocaleString(`en-IN`)} bytes`,a.hash.textContent=m,a.cipher.textContent=`${g.length.toLocaleString(`en-IN`)} bytes in ${y.toFixed(1)} ms · iv ${u(i)}`,a.key.textContent=`In memory, non-extractable`,a.attempt.textContent=`Not attempted`,a.body.textContent=h(n),a.body.dataset.state=`live`,p(`live`);let b=performance.now()+o*1e3,x=()=>{let e=Math.max(0,b-performance.now());a.clock.textContent=`00:${String(Math.ceil(e/1e3)).padStart(2,`0`)}`,a.bar.style.transform=`scaleX(${e/(o*1e3)})`,e===0&&(clearInterval(s),_({name:t,size:n.length,hash:m}))};x(),s=setInterval(x,100)}async function _(e){let{iv:t,cipher:n}=d;d=null,c={...e,at:new Date},a.key.textContent=`Destroyed`;let r=[...a.body.textContent],i=r.map((e,t)=>t).filter(e=>r[e].trim()).sort(()=>Math.random()-.5),o=Math.max(1,Math.ceil(i.length/45));await new Promise(e=>{let t=setInterval(()=>{i.splice(0,o).forEach(e=>{r[e]=` `}),a.body.textContent=r.join(``),i.length||(clearInterval(t),e())},30)}),a.body.textContent=``,a.body.dataset.state=`gone`;try{let e=await crypto.subtle.generateKey({name:`AES-GCM`,length:256},!1,[`decrypt`]);await crypto.subtle.decrypt({name:`AES-GCM`,iv:t},e,n),a.attempt.textContent=`Decrypted`}catch(e){a.attempt.textContent=`Failed: ${e.name}. The bytes are noise now.`}p(`receipt`)}async function v(e,t){let n=await f(t)===c.hash;a.verdict.dataset.ok=String(n),a.verdict.textContent=n?`${e} matches the receipt. The file was never stored, and it can still be proven.`:`${e} does not match this receipt. Different content, different hash.`}async function y(t){t&&(t.size>I?e.querySelector(`[data-v="dropsub"]`).textContent=`${t.name} is over the 25 MB limit. Try a smaller file.`:g(t.name,new Uint8Array(await t.arrayBuffer())))}n.addEventListener(`change`,()=>{y(n.files[0]),n.value=``}),t(`[data-a="sample"]`).addEventListener(`click`,()=>{g(`harbourline-msa.txt`,new TextEncoder().encode(l))}),t(`[data-a="again"]`).addEventListener(`click`,()=>{c=null,a.verdict.textContent=``,p(`idle`)}),t(`[data-a="reverify"]`).addEventListener(`click`,()=>{c?.name===`harbourline-msa.txt`?v(c.name,new TextEncoder().encode(l)):n.click()}),[`dragenter`,`dragover`].forEach(t=>e.addEventListener(t,e=>{e.preventDefault(),r.classList.add(`is-over`)})),[`dragleave`,`drop`].forEach(t=>e.addEventListener(t,e=>{e.preventDefault(),r.classList.remove(`is-over`)})),e.addEventListener(`drop`,e=>y(e.dataTransfer.files[0]))}var R=`#ECF1EA`,z=`#8C9C93`,B=`#4FEA92`,V=`rgba(236,241,234,.2)`,H=`#050807`,U=`"Enigma Sans",Arial,sans-serif`,W=e=>Math.min(1,Math.max(0,e)),G=(e,t,n)=>W((e-t)/(n-t)),K=e=>e*e*(3-2*e),q=(e,t,n)=>e+(t-e)*n,J=(e,t,n,r,i)=>{let a=1-i;return a*a*a*e+3*a*a*i*t+3*a*i*i*n+i*i*i*r};async function Y(){let e=document.querySelector(`.journey`);if(!e)return;let t=e.querySelector(`canvas`),n=t.getContext(`2d`),r=[...e.querySelectorAll(`.jstep`)],i=e.querySelector(`.jsteps i`),a=[...e.querySelectorAll(`.level button`)],o=e.querySelector(`.jsteps`);a.forEach(e=>e.addEventListener(`click`,()=>{o.dataset.show=e.dataset.level,a.forEach(t=>t.setAttribute(`aria-pressed`,String(t===e)))}));let s=0,c=0,l=null;function u(){let e=t.getBoundingClientRect(),r=Math.min(devicePixelRatio||1,2);s=e.width,c=e.height,t.width=Math.round(s*r),t.height=Math.round(c*r),n.setTransform(r,0,0,r,0,0);let i=Math.min(c*.46,s*.2,190),a=c*.5,o=i/190;l={s:i,y:a,k:o,file:{x:s*.11,w:74*o+20,h:92*o+24},room:{x:s*.47},answer:{x:s*.86,y:a-i*.72},receipt:{x:s*.86,y:a+i*.72}}}let d=(e,t,r,i,a)=>{n.font=a,n.fillStyle=i,n.textAlign=`center`,n.textBaseline=`alphabetic`,n.fillText(e,t,r)};function f(e,t,r,i,a,o=1.5){n.strokeStyle=a,n.lineWidth=o,n.beginPath(),n.moveTo(e,t),n.lineTo(r,i),n.stroke()}function p(e,t,r,i=1.5){n.strokeStyle=r,n.lineWidth=i,n.beginPath();for(let r=0;r<=40;r++){let i=r/40*t,a=J(e[0],e[2],e[4],e[6],i),o=J(e[1],e[3],e[5],e[7],i);r?n.lineTo(a,o):n.moveTo(a,o)}n.stroke()}function m(e,t,r,i,a,o){o<=0||(n.save(),n.globalAlpha=o,n.fillStyle=a>.5?`#0C1110`:`#FFFFFF`,n.strokeStyle=a>.5?B:R,n.lineWidth=2,n.fillRect(e-r/2,t-i/2,r,i),n.strokeRect(e-r/2,t-i/2,r,i),[.62,.62,.4].forEach((n,o)=>{let s=t-i*.22+o*i*.22;f(e-r*.3,s,e-r*.3+r*n,s,a>.5?B:`#59605B`,2.5)}),n.restore())}function h(e,t,r,i){r<=0||(n.save(),n.globalAlpha=r,n.translate(e,t),n.scale(i,i),n.strokeStyle=B,n.fillStyle=B,n.lineWidth=3,n.beginPath(),n.arc(0,-8,8,Math.PI,0),n.stroke(),n.fillRect(-12,-8,24,18),n.restore())}function g(e,t){n.clearRect(0,0,s,c);let{s:r,y:i,k:a,file:o,room:u,answer:g,receipt:_}=l,v=`600 ${Math.max(14,17*a)}px ${U}`,y=`${Math.max(12,14*a)}px ${U}`,b=K(G(e,.04,.18)),x=K(G(e,.22,.38)),S=G(e,.38,.42),C=G(e,.42,.56),w=K(G(e,.56,.7)),T=G(e,.74,.8),E=G(e,.76,.88),D=G(e,.88,.95),O=G(e,.95,1),k=u.x-r/2,A=u.x+r/2,j=34*a+8,M=[A,i-r*.22,A+(g.x-A)*.5,i-r*.22,A+(g.x-A)*.4,g.y,g.x-j-16,g.y],N=[A,i+r*.22,A+(_.x-A)*.5,i+r*.22,A+(_.x-A)*.4,_.y,_.x-j*1.1-6,_.y];f(o.x+o.w/2,i,k,i,V),x>0&&f(o.x+o.w/2,i,q(o.x+o.w/2,k,x),i,B,2),p(M,1,V),p(N,1,V),w>0&&(p(M,w,`rgba(79,234,146,${.9*(1-D)})`,2),p(N,w,B,2));let P=q(o.x,k-o.w*.1,x),F=1-.6*x;m(P,i,o.w*F,o.h*F,b,1-S),h(P+o.w*F*.34,i-o.h*F*.5,G(e,.14,.18)*(1-S),.8*Math.max(a,.7)),x>.05&&(n.setLineDash([5,6]),n.strokeStyle=V,n.lineWidth=1.5,n.strokeRect(o.x-o.w/2,i-o.h/2,o.w,o.h),n.setLineDash([])),d(x>.1?`Uploaded`:b>.5?`Locked`:`Your file`,o.x,i+o.h/2+30,x>.1?z:R,v);let I=S*(1-T);if(n.fillStyle=`#0C1110`,n.fillRect(k,i-r/2,r,r),n.strokeStyle=I>.5?B:`rgba(236,241,234,.42)`,n.lineWidth=I>.5?3:1.5,n.strokeRect(k,i-r/2,r,r),I>0){n.globalAlpha=I;for(let e=0;e<5;e++){let t=i-r*.24+e*r*.12;f(k+r*.2,t,k+r*(e===2?.62:.8),t,e===2&&C>.5?B:`rgba(236,241,234,.55)`,2.5)}if(C>0&&C<1){let e=i-r*.32+C*r*.64;f(k+r*.1,e,A-r*.1,e,B,2)}n.globalAlpha=1}if(T>0&&(n.globalAlpha=T*(1-O),d(`Key destroyed`,u.x,i+5,z,y),n.globalAlpha=1),d(`Enclave`,u.x,i-r/2-28,I>.5?B:R,v),d(`0G`,u.x,i-r/2-8,z,y),S>0&&T<1&&(n.globalAlpha=S*(1-T),d(`Sealed from the operator`,u.x,i+r/2+30,z,y),n.globalAlpha=1),w>0&&w<1)for(let e of[M,N])n.fillStyle=B,n.beginPath(),n.arc(J(e[0],e[2],e[4],e[6],w),J(e[1],e[3],e[5],e[7],w),6,0,7),n.fill();let L=G(e,.68,.72);L>0&&D<1&&(n.globalAlpha=L*(1-D),n.fillStyle=`#FFFFFF`,n.fillRect(g.x-j*.42,g.y-j*.52,j*.84,j*1.04),[0,1,2].forEach(e=>{let t=g.y-j*.24+e*j*.24;f(g.x-j*.26,t,g.x+j*(e===2?.04:.26),t,`#59605B`,2)}),n.strokeStyle=V,n.lineWidth=3,n.beginPath(),n.arc(g.x,g.y,j+8,0,7),n.stroke(),n.strokeStyle=B,n.beginPath(),n.arc(g.x,g.y,j+8,-Math.PI/2,-Math.PI/2+(1-E)*Math.PI*2),n.stroke(),n.globalAlpha=1),(L===0||D>0)&&(n.setLineDash([5,6]),n.strokeStyle=D>0?`rgba(255,120,100,.55)`:V,n.lineWidth=1.5,n.beginPath(),n.arc(g.x,g.y,j+8,0,7),n.stroke(),n.setLineDash([])),d(D>.5?`Gone`:`Answer`,g.x,g.y-j-42+4,D>.5?`#FF8E7A`:L>0?R:z,v),d(`Arkiv`,g.x,g.y-j-18,z,y);let W=j*1.1;L<1&&(n.setLineDash([5,6]),n.strokeStyle=V,n.lineWidth=1.5,n.strokeRect(_.x-W,_.y-W*.7,W*2,W*1.4),n.setLineDash([])),L>0&&(O>0&&(n.strokeStyle=`rgba(79,234,146,${O*(.5+.3*Math.sin(t*3))})`,n.lineWidth=2,n.strokeRect(_.x-W-9,_.y-W*.7-9,W*2+18,W*1.4+18)),n.globalAlpha=L,n.fillStyle=B,n.fillRect(_.x-W,_.y-W*.7,W*2,W*1.4),f(_.x-W*.5,_.y-W*.18,_.x+W*.5,_.y-W*.18,H,2.5),f(_.x-W*.5,_.y+W*.16,_.x+W*.2,_.y+W*.16,H,2.5),n.globalAlpha=1),d(O>.4?`Only this remains`:`Receipt`,_.x,_.y+W*.7+28,O>.4?B:L>0?R:z,v),d(`Whitechain`,_.x,_.y+W*.7+48,z,y)}let _=matchMedia(`(prefers-reduced-motion: reduce)`).matches,v=0,y=0,b=!1,x=!1,S=0;function C(e){let t=e<.22?0:e<.56?1:e<.74?2:3;r.forEach((e,n)=>e.setAttribute(`aria-current`,String(n===t))),i.style.transform=`scaleX(${e})`}function w(t){if(!b){x=!1;return}let n=t/1e3,r=Math.min(.1,n-(S||n));S=n;let i=e.getBoundingClientRect();v=W(-i.top/(i.height-innerHeight)),y=_?v:y+(v-y)*(1-Math.exp(-r*10)),g(y,n),C(y),requestAnimationFrame(w)}new IntersectionObserver(([e])=>{b=e.isIntersecting,b&&!x&&(x=!0,S=0,requestAnimationFrame(w))}).observe(e),new ResizeObserver(()=>{u(),g(y,0)}).observe(t),await document.fonts.load(`600 17px ${U}`),u(),g(0,0),C(0);let T=[.14,.5,.68,.96];r.forEach((t,n)=>t.addEventListener(`click`,()=>{let t=e.getBoundingClientRect();scrollTo({top:scrollY+t.top+T[n]*(t.height-innerHeight)})}))}var X=`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/`,Z=matchMedia(`(prefers-reduced-motion: reduce)`).matches;function Q(e){let t=[...e.querySelectorAll(`.w`)],n=performance.now(),r=i=>{let a=Math.min(1,(i-n)/620);for(let n of t){let t=n.dataset.t,r=``;for(let i=0;i<t.length;i++){let o=(Number(n.dataset.i)*3+i)/(e.dataset.len||40);r+=a>=o*.75+.25?t[i]:X[Math.floor(Math.random()*64)]}n.textContent=r}if(a<1)requestAnimationFrame(r);else for(let e of t)e.textContent=e.dataset.t};requestAnimationFrame(r)}function $(e){let t=e.textContent.trim();e.setAttribute(`aria-label`,t),e.dataset.len=t.length,e.textContent=``,t.split(` `).forEach((t,n)=>{let r=document.createElement(`span`);r.className=`w`,r.textContent=t,r.dataset.t=t,r.dataset.i=n,r.setAttribute(`aria-hidden`,`true`),e.append(r,` `)});for(let t of e.querySelectorAll(`.w`))t.style.width=`${t.getBoundingClientRect().width+.5}px`}function ee(e){let t=Number(e.dataset.count),n=Number(e.dataset.dec||0),r=performance.now(),i=t=>`${e.dataset.pre||``}${t.toFixed(n)}${e.dataset.post||``}`,a=n=>{let o=Math.min(1,(n-r)/1100),s=1-(1-o)**3;e.textContent=i(t*s),o<1&&requestAnimationFrame(a)};requestAnimationFrame(a)}function te(){let e=[...document.querySelectorAll(`[data-decrypt]`)];document.fonts.ready.then(()=>{Z||e.forEach($);let t=new IntersectionObserver(e=>{for(let n of e)n.isIntersecting&&(t.unobserve(n.target),n.target.classList.add(`is-in`),!Z&&n.target.hasAttribute(`data-decrypt`)&&Q(n.target),!Z&&n.target.dataset.count&&ee(n.target))},{rootMargin:`0px 0px -12% 0px`});document.querySelectorAll(`[data-decrypt],[data-reveal],[data-count]`).forEach(e=>t.observe(e))}),document.querySelectorAll(`.flow svg, .tile svg`).forEach(e=>{Z?e.pauseAnimations():new IntersectionObserver(([t])=>t.isIntersecting?e.unpauseAnimations():e.pauseAnimations()).observe(e)})}L(),Y(),te(),F().catch(e=>{console.warn(`[enigma]`,e),document.documentElement.classList.remove(`gl`,`intro-pending`)});