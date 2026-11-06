// AI-assisted: Used Claude for the landing page visuals and animation
// Digital rain renderer. Raw WebGL2, no libraries.
// Three passes: scene (glyph field + headline + enclave window), bloom, composite.

const VERT = `#version 300 es
out vec2 v;
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); v=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;

const SCENE = `#version 300 es
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
}`;

const BRIGHT = `#version 300 es
precision mediump float;
in vec2 v; out vec4 o; uniform sampler2D uTex;
void main(){ vec4 s=texture(uTex,v); o=vec4(s.rgb*s.a,1.); }`;

const BLUR = `#version 300 es
precision mediump float;
in vec2 v; out vec4 o; uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec3 c=texture(uTex,v).rgb*.227;
  c+=(texture(uTex,v+uDir*1.385).rgb+texture(uTex,v-uDir*1.385).rgb)*.316;
  c+=(texture(uTex,v+uDir*3.231).rgb+texture(uTex,v-uDir*3.231).rgb)*.07;
  o=vec4(c,1.);
}`;

const COMPOSITE = `#version 300 es
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
}`;

function compile(gl, vs, fs) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace('[0]', '');
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

function target(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  setFilter(gl, gl.LINEAR);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}

function setFilter(gl, f) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

export function createRain(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;

  const scene = compile(gl, VERT, SCENE);
  const bright = compile(gl, VERT, BRIGHT);
  const blur = compile(gl, VERT, BLUR);
  const comp = compile(gl, VERT, COMPOSITE);
  gl.bindVertexArray(gl.createVertexArray());

  const tex = { atlas: gl.createTexture(), mask: gl.createTexture(), cipher: gl.createTexture(), plain: gl.createTexture() };
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  const state = {
    scale: 1, css: [1, 1], cell: [11, 19], grid: [1, 1], plainSize: [1, 1],
    depth: 1, drop1: 0, drop2: 0, lensOn: 0, lens: [0, 0, 0, 0], quiet: new Array(12).fill(0), alarm: 0, seal: -20, flash: 0, show: 1, agents: new Array(20).fill(-99), fade: 1,
  };
  let rt = null;

  function bindTex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }

  function buildAtlas() {
    const cw = 48, ch = 84, w = cw * 16, h = ch * 6;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '72px "Enigma Mono", monospace';
    for (let i = 0; i < 96; i++) x.fillText(String.fromCharCode(32 + i), (i % 16 + .5) * cw, (Math.floor(i / 16) + .54) * ch);
    bindTex(0, tex.atlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, c);
    setFilter(gl, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  function setCipher(ascii) {
    bindTex(2, tex.cipher);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, ascii);
    setFilter(gl, gl.NEAREST);
  }

  function setPlain(data, w, h) {
    bindTex(3, tex.plain);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, w, h, 0, gl.RG, gl.UNSIGNED_BYTE, data);
    setFilter(gl, gl.NEAREST);
    state.plainSize = [w, h];
  }

  function setMask(source) {
    bindTex(1, tex.mask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    setFilter(gl, gl.LINEAR);
  }

  function resize(cssW, cssH, dprCap) {
    state.css = [cssW, cssH];
    const s = Math.min(window.devicePixelRatio || 1, dprCap);
    state.scale = s;
    const w = Math.round(cssW * s), h = Math.round(cssH * s);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const unit = cssW < 720 ? 10 : 12;
    state.cell = [unit, Math.round(unit * 1.75)];
    state.grid = [Math.ceil(cssW / state.cell[0]), Math.ceil(cssH / state.cell[1])];
    const del = (t) => { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } };
    if (rt) { del(rt.a); del(rt.b); del(rt.c); }
    const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
    rt = { a: target(gl, w, h), b: target(gl, bw, bh), c: target(gl, bw, bh) };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  const tri = () => gl.drawArrays(gl.TRIANGLES, 0, 3);

  function draw(t) {
    const s = state.scale;
    // Scene
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.a.fbo);
    gl.viewport(0, 0, rt.a.w, rt.a.h);
    gl.useProgram(scene.p);
    const u = scene.u;
    bindTex(0, tex.atlas); bindTex(1, tex.mask); bindTex(2, tex.cipher); bindTex(3, tex.plain);
    gl.uniform1i(u.uAtlas, 0); gl.uniform1i(u.uMask, 1); gl.uniform1i(u.uCipher, 2); gl.uniform1i(u.uPlain, 3);
    gl.uniform2f(u.uRes, rt.a.w, rt.a.h);
    gl.uniform2f(u.uCell, state.cell[0] * s, state.cell[1] * s);
    gl.uniform2f(u.uGrid, state.grid[0], state.grid[1]);
    gl.uniform2i(u.uPlainSize, state.plainSize[0], state.plainSize[1]);
    gl.uniform1f(u.uT, t);
    gl.uniform1f(u.uDrop1, state.drop1);
    gl.uniform1f(u.uDrop2, state.drop2);
    gl.uniform1f(u.uLensOn, state.lensOn);
    gl.uniform1f(u.uDepth, state.depth);
    gl.uniform1f(u.uFade, state.fade);
    gl.uniform1f(u.uAlarm, state.alarm);
    gl.uniform1f(u.uSeal, state.seal);
    gl.uniform1f(u.uFlash, state.flash);
    gl.uniform1f(u.uShow, state.show);
    gl.uniform4fv(u.uAgents, state.agents);
    gl.uniform4fv(u.uLens, state.lens);
    gl.uniform4fv(u.uQuiet, state.quiet.map((q) => q * s));
    tri();

    // Bloom
    gl.useProgram(bright.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.b.fbo);
    gl.viewport(0, 0, rt.b.w, rt.b.h);
    bindTex(0, rt.a.tex);
    gl.uniform1i(bright.u.uTex, 0);
    tri();

    gl.useProgram(blur.p);
    gl.uniform1i(blur.u.uTex, 0);
    for (const spread of [1.4, 2.6]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.c.fbo);
      bindTex(0, rt.b.tex);
      gl.uniform2f(blur.u.uDir, spread / rt.b.w, 0);
      tri();
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.b.fbo);
      bindTex(0, rt.c.tex);
      gl.uniform2f(blur.u.uDir, 0, spread / rt.b.h);
      tri();
    }

    // Composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(comp.p);
    bindTex(0, rt.a.tex); bindTex(1, rt.b.tex);
    gl.uniform1i(comp.u.uTex, 0); gl.uniform1i(comp.u.uBloom, 1);
    gl.uniform1f(comp.u.uT, t);
    gl.uniform2f(comp.u.uRes, canvas.width, canvas.height);
    tri();
  }

  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';

  return { state, gpu, buildAtlas, setCipher, setPlain, setMask, resize, draw };
}
