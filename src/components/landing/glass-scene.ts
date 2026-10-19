/**
 * The landing page's background: six thin, curved, double-sided glass sheets
 * drawn in WebGL 2, drifting round the window.
 *
 * Each sheet is an indexed mesh bent in the vertex shader (perspective, camber,
 * torsion, four elastic modes computed in glass-view.ts). The fragment shader
 * is thin clear glass: weak reflection head-on, strong at grazing angles, sharp
 * softbox reflections, a luminous edge and a faint second-surface reflection.
 * The scene is drawn with 4x MSAA into an offscreen target, a light bloom is
 * taken at a third of the size, and a last pass lays both over the black.
 *
 * It only paints the glass, bright on black. The copy, the buttons and the
 * header are the page's own elements, above the canvas, and each section keeps
 * the glass off its text itself, or turns it into smoke (see page.module.css,
 * FeatureTour.module.css). Nothing here reads the pointer or the scroll
 * position.
 */

import {
  glassView,
  modes,
  SHEETS,
  sheetTurn,
  type GlassLayout,
} from "./glass-view";

const NU = 220;
const NV = 22;

const FULL_VERTEX = `#version 300 es
in vec2 aPosition;
out vec2 uv;
void main(){uv=aPosition*.5+.5;gl_Position=vec4(aPosition,0,1);}`;

const SHEET_VERTEX = `#version 300 es
precision highp float;
in vec2 aPosition;
uniform float uTime;
uniform vec4 uSheet;
uniform vec4 uShape;
uniform vec4 uMode;
uniform vec2 uView;
out vec3 world;
out vec3 normal;
out vec2 param;
const float PI=3.141592653589793;
vec3 surface(vec2 q){
float u=q.x,v=q.y,ph=uShape.x;
float turn=uSheet.x+uSheet.y*uTime+.055*sin(uTime*.213+ph);
float a=turn+uSheet.z*(u-.5)+.105*uMode.x*sin(PI*u+ph)+.055*uMode.y*sin(2.*PI*u+ph*.3);
float lobe=.26*sin(4.3*u+ph*.7-uTime*.12)+.14*uMode.x*sin(6.1*u+ph);
float flare=.85*pow(abs(u*2.-1.),4.);
float rx=uShape.y+.29*sin(3.9*u+ph)+.18*uMode.x*sin(PI*u)+lobe+flare*1.6;
float ry=uShape.z+.19*cos(4.4*u+ph)+.16*uMode.y*sin(PI*u*2.+ph)+lobe*.45+flare*.90;
vec3 radial=normalize(vec3(cos(a),sin(a)*.82,0));
vec3 p=vec3(rx*cos(a),ry*sin(a),.34*sin(a*1.6+ph)+.24*sin(4.8*u+ph-uTime*.19)+uShape.w);
p.xy+=vec2(.16*sin(5.1*u+ph+uMode.w*.4),.10*sin(5.8*u+ph*.5+uMode.y*.35));
p.xy+=vec2(.045*sin(uTime*.19+ph),.035*cos(uTime*.23+ph*.7));
p.z+=.16*uMode.z*sin(PI*u+ph)+.065*uMode.w*sin(PI*u*2.);
float taper=pow(max(.0001,sin(PI*clamp(u,0.,1.))),.48);
float width=uSheet.w*taper*(1.+.14*uMode.y*sin(3.*u+ph));
float twist=.42*sin(4.1*u+ph-uTime*.24)+.27*uMode.z*sin(3.7*u+ph)+.25*sin(a*.8+ph);
float fold=.26*(v*v-.32)*sin(4.5*u+ph-uTime*.22)+.16*sin(v*3.6+3.2*u+ph-uTime*.31)+.075*uMode.w*sin(v*5.+u*3.);
p+=width*v*(radial*cos(twist)+vec3(0,0,1)*sin(twist));
p.z+=width*fold*2.;
p+=radial*(width*.07*uMode.x*sin(v*PI)*sin(u*4.+ph));
return p;
}
void main(){
param=aPosition;world=surface(aPosition);
vec3 du=surface(aPosition+vec2(.0008,0))-surface(aPosition-vec2(.0008,0));
vec3 dv=surface(aPosition+vec2(0,.0012))-surface(aPosition-vec2(0,.0012));
normal=normalize(cross(du,dv));
float perspective=(6.-world.z)/6.;
// The approved frame is fitted over the window (see glassView): the scale is
// applied after the perspective divide, so depth is unchanged.
gl_Position=vec4(world.xy*uView,.1,perspective);
}`;

const SHEET_FRAGMENT = `#version 300 es
precision highp float;
in vec3 world;
in vec3 normal;
in vec2 param;
uniform float uOpacity;
out vec4 color;
float softbox(vec3 r,vec3 axis,float c,float w){return exp(-pow((dot(r,axis)-c)/w,2.));}
float studio(vec3 r){
float wide=exp(-pow((r.y+.20)/.60,2.));
float box=softbox(r,normalize(vec3(.78,0.,.62)),.22*.99,.30);
float s1=softbox(r,normalize(vec3(.83,0.,.55)),.18,.11);
float s2=softbox(r,normalize(vec3(0.,.75,-.66)),.05,.14);
float s3=softbox(r,normalize(vec3(-.70,.50,.50)),.30,.12);
float s4=softbox(r,normalize(vec3(.20,-.80,.55)),.25,.09);
return .035*wide+.09*box+.95*s1+.62*s2+.55*s3+.45*s4;
}
void main(){
vec3 V=normalize(vec3(0,0,6)-world),N=normalize(normal);
if(dot(N,V)<0.)N=-N;
float nv=clamp(dot(N,V),0.,1.);
float fresnel=.045+.955*pow(1.-nv,3.2);
vec3 reflected=reflect(-V,N);
float L=studio(reflected);float hard=smoothstep(.20,.46,L);
float front=(hard*.62+L*.22)*(.22+.78*fresnel);
vec3 N2=normalize(N+vec3(.10*sin(param.x*17.+param.y*2.),.08*cos(param.x*13.-param.y*3.),0.));
float L2=studio(reflect(-V,N2));float back=(smoothstep(.25,.55,L2)*.30+L2*.08)*(.15+.45*fresnel);
float e=1.-abs(param.y);
float edge=exp(-e/.014)*.95+exp(-e/.05)*.12;
float rim=edge*(.55+.45*fresnel)*(.55+.45*min(1.,L*2.2));
float body=.004+.030*fresnel;
float radiance=body+front+back+rim*1.05;
float ends=smoothstep(0.,.07,param.x)*(1.-smoothstep(.93,1.,param.x));
float opacity=ends*uOpacity;
float grain=fract(sin(dot(world.xy,vec2(127.1,311.7)))*43758.5453);
vec3 tint=mix(vec3(.93,.95,.98),vec3(1),clamp(front*1.2,0.,1.));
vec3 transmission=tint*radiance*opacity*(.996+.008*grain);
color=vec4(min(transmission,vec3(.88)),opacity);
}`;

const BLUR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D image;
uniform vec2 direction;
uniform float threshold;
out vec4 color;
vec3 sampleAt(vec2 p){return max(vec3(0),texture(image,p).rgb-vec3(threshold));}
void main(){vec3 c=sampleAt(uv)*.227027;c+=(sampleAt(uv+direction*1.384615)+sampleAt(uv-direction*1.384615))*.316216;c+=(sampleAt(uv+direction*3.230769)+sampleAt(uv-direction*3.230769))*.070270;color=vec4(c,1);}`;

const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D scene;
uniform sampler2D bloom;
out vec4 color;
void main(){
vec3 bg=vec3(.0308,.0308,.0343)+.0025*exp(-length((uv-.5)*vec2(1.,1.4))*4.);
vec3 silver=texture(scene,uv).rgb;vec3 glow=texture(bloom,uv).rgb;
color=vec4(min(vec3(.995),bg+silver*1.12+glow*.12),1);
}`;

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

interface MultisampleTarget {
  renderbuffer: WebGLRenderbuffer;
  framebuffer: WebGLFramebuffer;
}

/** What the scene tells its owner about the GL context. */
export interface GlassSceneEvents {
  onContextLost(): void;
  onContextRestored(): void;
}

export interface GlassScene {
  /** Fits the scene to the window. Resizing the backbuffer redraws nothing. */
  layout(layout: GlassLayout): void;
  /** Draws the scene at `time` seconds. Does nothing while the context is lost. */
  render(time: number): void;
  /** Frees every GL resource. The canvas itself is left as it was. */
  dispose(): void;
}

/**
 * Starts the scene on `canvas`. Returns null, without side effects that
 * outlive the call, when WebGL 2 is missing or the shaders do not build; the
 * caller then keeps the page's own background.
 */
export function createGlassScene(
  canvas: HTMLCanvasElement,
  events: GlassSceneEvents,
): GlassScene | null {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: false,
  });
  if (!context) return null;
  // The function declarations below are hoisted, so the narrowing above would
  // not reach them; a typed constant does.
  const gl: WebGL2RenderingContext = context;

  let resources: ReturnType<typeof build> | null = null;
  let lastLayout: GlassLayout | null = null;
  let lost = gl.isContextLost();

  function build(gl: WebGL2RenderingContext) {
    const programs: WebGLProgram[] = [];
    const buffers: WebGLBuffer[] = [];
    const arrays: WebGLVertexArrayObject[] = [];

    function compile(type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Could not create a shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? "Shader did not compile");
      }
      return shader;
    }

    function program(vertex: string, fragment: string) {
      const handle = gl.createProgram();
      if (!handle) throw new Error("Could not create a program");
      gl.attachShader(handle, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(handle, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(handle);
      if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(handle) ?? "Program did not link");
      }
      programs.push(handle);
      return handle;
    }

    function buffer(target: number, data: BufferSource) {
      const handle = gl.createBuffer();
      if (!handle) throw new Error("Could not create a buffer");
      gl.bindBuffer(target, handle);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      buffers.push(handle);
      return handle;
    }

    const sheet = program(SHEET_VERTEX, SHEET_FRAGMENT);
    const blur = program(FULL_VERTEX, BLUR_FRAGMENT);
    const composite = program(FULL_VERTEX, COMPOSITE_FRAGMENT);

    // One full-screen triangle pair for the blur and composite passes.
    const quad = gl.createVertexArray();
    arrays.push(quad);
    gl.bindVertexArray(quad);
    buffer(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    );
    for (const p of [blur, composite]) {
      const a = gl.getAttribLocation(p, "aPosition");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);

    // The sheet mesh: a grid in (u along the sheet, v across it).
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= NU; i++) {
      for (let j = 0; j <= NV; j++) vertices.push(i / NU, (j / NV) * 2 - 1);
    }
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const k = i * (NV + 1) + j;
        indices.push(k, k + NV + 1, k + 1, k + 1, k + NV + 1, k + NV + 2);
      }
    }
    const mesh = gl.createVertexArray();
    arrays.push(mesh);
    gl.bindVertexArray(mesh);
    buffer(gl.ARRAY_BUFFER, new Float32Array(vertices));
    const position = gl.getAttribLocation(sheet, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices));
    gl.bindVertexArray(null);

    const uniform = (p: WebGLProgram, name: string) =>
      gl.getUniformLocation(p, name);

    return {
      programs,
      buffers,
      arrays,
      sheet,
      blur,
      composite,
      quad,
      mesh,
      indexCount: indices.length,
      samples: Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number),
      sheetUniforms: {
        time: uniform(sheet, "uTime"),
        sheet: uniform(sheet, "uSheet"),
        shape: uniform(sheet, "uShape"),
        mode: uniform(sheet, "uMode"),
        view: uniform(sheet, "uView"),
        opacity: uniform(sheet, "uOpacity"),
      },
      blurUniforms: {
        image: uniform(blur, "image"),
        threshold: uniform(blur, "threshold"),
        direction: uniform(blur, "direction"),
      },
      compositeUniforms: {
        scene: uniform(composite, "scene"),
        bloom: uniform(composite, "bloom"),
      },
      // Sized when the first layout arrives.
      scene: null as Target | null,
      sceneSamples: null as MultisampleTarget | null,
      bloomA: null as Target | null,
      bloomB: null as Target | null,
      view: null as ReturnType<typeof glassView> | null,
    };
  }

  function makeTexture(width: number, height: number) {
    const texture = gl.createTexture();
    if (!texture) throw new Error("Could not create a texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return texture;
  }

  function makeTarget(width: number, height: number): Target {
    const texture = makeTexture(width, height);
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error("Could not create a framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Incomplete framebuffer");
    }
    return { texture, framebuffer, width, height };
  }

  function makeMultisampleTarget(
    width: number,
    height: number,
    samples: number,
  ): MultisampleTarget {
    const renderbuffer = gl.createRenderbuffer();
    const framebuffer = gl.createFramebuffer();
    if (!renderbuffer || !framebuffer) throw new Error("Could not create a target");
    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, renderbuffer);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Incomplete multisample framebuffer");
    }
    return { renderbuffer, framebuffer };
  }

  function disposeTarget(target: Target | null) {
    if (!target) return;
    gl.deleteTexture(target.texture);
    gl.deleteFramebuffer(target.framebuffer);
  }

  function disposeTargets() {
    if (!resources) return;
    disposeTarget(resources.scene);
    disposeTarget(resources.bloomA);
    disposeTarget(resources.bloomB);
    if (resources.sceneSamples) {
      gl.deleteRenderbuffer(resources.sceneSamples.renderbuffer);
      gl.deleteFramebuffer(resources.sceneSamples.framebuffer);
    }
    resources.scene = resources.bloomA = resources.bloomB = null;
    resources.sceneSamples = null;
  }

  function disposeResources() {
    if (!resources) return;
    disposeTargets();
    for (const p of resources.programs) gl.deleteProgram(p);
    for (const b of resources.buffers) gl.deleteBuffer(b);
    for (const a of resources.arrays) gl.deleteVertexArray(a);
    resources = null;
  }

  function applyLayout(next: GlassLayout) {
    if (!resources || lost) return;
    const view = glassView(next);
    const previous = resources.view;
    resources.view = view;
    if (
      previous &&
      previous.pixelWidth === view.pixelWidth &&
      previous.pixelHeight === view.pixelHeight &&
      resources.scene
    ) {
      return;
    }
    canvas.width = view.pixelWidth;
    canvas.height = view.pixelHeight;
    disposeTargets();
    const w = view.pixelWidth;
    const h = view.pixelHeight;
    resources.scene = makeTarget(w, h);
    resources.sceneSamples = makeMultisampleTarget(w, h, resources.samples);
    resources.bloomA = makeTarget(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)));
    resources.bloomB = makeTarget(resources.bloomA.width, resources.bloomA.height);
  }

  function bindTarget(width: number, height: number, framebuffer: WebGLFramebuffer | null) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, width, height);
  }

  function bindTexture(unit: number, texture: WebGLTexture) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  function render(time: number) {
    const r = resources;
    if (!r || lost || !r.view || !r.scene || !r.sceneSamples || !r.bloomA || !r.bloomB) {
      return;
    }
    const { view, scene, sceneSamples, bloomA, bloomB } = r;
    const w = view.pixelWidth;
    const h = view.pixelHeight;

    // 1. The sheets, additively, into the multisampled target.
    bindTarget(w, h, sceneSamples.framebuffer);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(r.sheet);
    gl.bindVertexArray(r.mesh);
    const u = r.sheetUniforms;
    gl.uniform1f(u.time, time);
    gl.uniform2f(u.view, view.scaleX, view.scaleY);
    for (const sheet of SHEETS) {
      gl.uniform4f(u.sheet, sheetTurn(sheet, time), sheet.rate, sheet.span, sheet.width);
      gl.uniform4f(u.shape, sheet.ph, sheet.rx, sheet.ry, sheet.z);
      gl.uniform4fv(u.mode, modes(time, sheet.ph));
      gl.uniform1f(u.opacity, sheet.opacity);
      gl.drawElements(gl.TRIANGLES, r.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    // 2. Resolve the multisamples.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sceneSamples.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, scene.framebuffer);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);

    // 3. Bloom: bright parts only, blurred across then down at a third size.
    gl.disable(gl.BLEND);
    gl.bindVertexArray(r.quad);
    gl.useProgram(r.blur);
    gl.uniform1i(r.blurUniforms.image, 0);
    gl.uniform1f(r.blurUniforms.threshold, 0.16);
    gl.uniform2f(r.blurUniforms.direction, 2.4 / w, 0);
    bindTexture(0, scene.texture);
    bindTarget(bloomA.width, bloomA.height, bloomA.framebuffer);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.uniform1f(r.blurUniforms.threshold, 0);
    gl.uniform2f(r.blurUniforms.direction, 0, 2.4 / bloomA.height);
    bindTexture(0, bloomA.texture);
    bindTarget(bloomB.width, bloomB.height, bloomB.framebuffer);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 4. The black, the glass and the glow, to the canvas.
    bindTarget(w, h, null);
    gl.useProgram(r.composite);
    gl.bindVertexArray(r.quad);
    bindTexture(0, scene.texture);
    bindTexture(1, bloomB.texture);
    gl.uniform1i(r.compositeUniforms.scene, 0);
    gl.uniform1i(r.compositeUniforms.bloom, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  const onLost = (event: Event) => {
    // Without this the browser would never offer to restore the context.
    event.preventDefault();
    lost = true;
    resources = null;
    events.onContextLost();
  };
  const onRestored = () => {
    lost = false;
    try {
      resources = build(gl);
      if (lastLayout) applyLayout(lastLayout);
    } catch {
      resources = null;
      lost = true;
      return;
    }
    events.onContextRestored();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  try {
    if (!lost) resources = build(gl);
  } catch {
    disposeResources();
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    return null;
  }

  return {
    layout(next) {
      lastLayout = next;
      try {
        applyLayout(next);
      } catch {
        // A target that cannot be built (out of memory) leaves nothing to draw.
        disposeTargets();
      }
    },
    render(time) {
      render(time);
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (!lost) disposeResources();
      resources = null;
    },
  };
}
