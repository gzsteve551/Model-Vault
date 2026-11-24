import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const list = document.querySelector("#models"), status = document.querySelector("#status");
const fileInput = document.querySelector("#file"), uploadBtn = document.querySelector("#upload");
const viewer = document.querySelector("#viewer"), selected = document.querySelector("#selected");
let renderer, scene, camera, controls, current;

function setupViewer() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(4, 3, 5);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  viewer.innerHTML = ""; viewer.appendChild(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x536080, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2.5); light.position.set(4, 7, 5); scene.add(light);
  const grid = new THREE.GridHelper(10, 20, 0x536080, 0x27334d); scene.add(grid);
  resize(); window.addEventListener("resize", resize);
  (function animate(){ requestAnimationFrame(animate); controls.update(); renderer.render(scene,camera); })();
}
function resize(){ if(!renderer)return; const w=viewer.clientWidth,h=viewer.clientHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
function clearCurrent(){ if(current){scene.remove(current); current.traverse?.(o=>{o.geometry?.dispose?.(); if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose?.())}}); current=null;} }
function frameObject(obj){ const box=new THREE.Box3().setFromObject(obj); const size=box.getSize(new THREE.Vector3()); const center=box.getCenter(new THREE.Vector3()); obj.position.sub(center); const max=Math.max(size.x,size.y,size.z)||1; camera.position.set(max*1.8,max*1.2,max*1.8); controls.target.set(0,0,0); controls.update(); }
async function showModel(model){
  selected.textContent=model.name; status.textContent="Loading preview…";
  try{
    clearCurrent();
    const url=model.download;
    const ext=model.name.split(".").pop().toLowerCase();
    if(ext==="glb"||ext==="gltf") current=(await new GLTFLoader().loadAsync(url)).scene;
    else if(ext==="obj") current=await new OBJLoader().loadAsync(url);
    else if(ext==="stl"){ const geo=await new STLLoader().loadAsync(url); current=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x9baeff,metalness:.25,roughness:.55})); }
    current.traverse?.(o=>{if(o.isMesh){o.material=o.material||new THREE.MeshStandardMaterial({color:0x9baeff});}});
    scene.add(current); frameObject(current); status.textContent="";
  }catch(e){status.textContent="Could not preview this file. Try downloading it or check whether its format is supported.";}
}
async function refresh(){
  list.textContent="Loading models…";
  try{
    const res=await fetch("/api/models"); if(!res.ok)throw new Error();
    const models=await res.json(); list.innerHTML="";
    if(!models.length){list.textContent="No models uploaded yet.";return;}
    for(const model of models){const b=document.createElement("button");b.className="model";b.textContent=model.name;b.onclick=()=>{document.querySelectorAll(".model").forEach(x=>x.classList.remove("active"));b.classList.add("active");showModel(model)};list.appendChild(b);}
  }catch{list.textContent="Couldn't load models. Check the Worker and GitHub repository settings.";}
}
uploadBtn.onclick=async()=>{
  const file=fileInput.files[0]; if(!file){status.textContent="Choose a model file first.";return;}
  const data=new FormData();data.append("file",file);uploadBtn.disabled=true;status.textContent="Uploading…";
  try{const res=await fetch("/api/upload",{method:"POST",body:data});const result=await res.json();if(!res.ok)throw new Error(result.error||"Upload failed.");status.textContent="Uploaded successfully.";fileInput.value="";await refresh();}
  catch(e){status.textContent=e.message;}finally{uploadBtn.disabled=false;}
};
document.querySelector("#refresh").onclick=refresh;
setupViewer();refresh();
