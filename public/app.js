import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const $ = (id) => document.getElementById(id);
const listEl = $("model-list");
const viewerEl = $("viewer");
let models = [];
let selectedKey = null;
let renderer, scene, camera, controls, currentModel;

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function prettyDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function setMessage(message, isError = false) {
  $("upload-message").textContent = message;
  $("upload-message").style.color = isError ? "#ff9b9b" : "var(--cyan)";
}

async function checkAdmin() {
  try {
    const response = await fetch("/api/admin/me", { credentials: "include" });
    if (!response.ok) throw new Error("not authorized");
    const data = await response.json();
    $("upload-panel").classList.remove("hidden");
    $("account-status").textContent = `Uploader: ${data.email}`;
  } catch {
    $("upload-panel").classList.add("hidden");
    $("account-status").textContent = "Public gallery";
  }
}

async function loadModels() {
  listEl.innerHTML = '<div class="empty-state">Loading models…</div>';
  try {
    const response = await fetch("/api/models");
    if (!response.ok) throw new Error("Could not load model list.");
    const data = await response.json();
    models = data.models || [];
    $("model-count").textContent = `${models.length} MODEL${models.length === 1 ? "" : "S"}`;
    renderList();
  } catch (error) {
    listEl.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
}

function renderList() {
  if (!models.length) {
    listEl.innerHTML = '<div class="empty-state">No models yet.<br>Authorized uploaders can add the first one.</div>';
    return;
  }
  listEl.replaceChildren();
  for (const model of models) {
    const button = document.createElement("button");
    button.className = `model-item${selectedKey === model.key ? " active" : ""}`;
    button.type = "button";
    const thumb = document.createElement("span");
    thumb.className = "model-thumb";
    thumb.textContent = "◇";
    const meta = document.createElement("span");
    meta.className = "model-meta";
    const name = document.createElement("strong");
    name.textContent = model.name;
    const detail = document.createElement("small");
    detail.textContent = `${formatSize(model.size)} · ${prettyDate(model.uploaded)}`;
    meta.append(name, detail);
    button.append(thumb, meta);
    button.addEventListener("click", () => selectModel(model));
    listEl.append(button);
  }
}

function initViewer() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171c27);
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(4, 3, 5);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
  viewerEl.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x394052, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.position.set(5, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9b8cff, 1.5);
  rim.position.set(-5, 2, -4);
  scene.add(rim);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  const grid = new THREE.GridHelper(12, 24, 0x42465e, 0x292f40);
  grid.position.y = -1.1;
  scene.add(grid);

  const resize = () => {
    const width = viewerEl.clientWidth, height = viewerEl.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  new ResizeObserver(resize).observe(viewerEl);
  const animate = () => {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();
}

function clearCurrentModel() {
  if (!currentModel) return;
  scene.remove(currentModel);
  currentModel.traverse?.(item => {
    item.geometry?.dispose?.();
    if (Array.isArray(item.material)) item.material.forEach(m => m.dispose?.());
    else item.material?.dispose?.();
  });
  currentModel = null;
}

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const distance = maxDim * 2.3;
  camera.position.set(distance, distance * .7, distance);
  camera.near = Math.max(maxDim / 1000, .01);
  camera.far = maxDim * 100;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}

async function selectModel(model) {
  selectedKey = model.key;
  renderList();
  $("viewer-title").textContent = model.name.toUpperCase();
  $("model-details").textContent = `${formatSize(model.size)} · uploaded ${prettyDate(model.uploaded)}`;
  $("viewer-placeholder").classList.remove("hidden");
  $("viewer-placeholder").querySelector("strong").textContent = "Loading model…";
  clearCurrentModel();
  const url = `/api/models/${encodeURIComponent(model.key)}`;
  const ext = model.key.split(".").pop().toLowerCase();

  try {
    let object;
    if (ext === "glb") {
      const gltf = await new GLTFLoader().loadAsync(url);
      object = gltf.scene;
    } else if (ext === "obj") {
      object = await new OBJLoader().loadAsync(url);
      object.traverse(child => {
        if (child.isMesh) child.material = new THREE.MeshStandardMaterial({ color: 0xaaa8c9, metalness: .18, roughness: .58 });
      });
    } else if (ext === "stl") {
      const geometry = await new STLLoader().loadAsync(url);
      geometry.computeVertexNormals();
      object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x9b8cff, metalness: .25, roughness: .42 }));
    } else {
      throw new Error("This file type is not supported.");
    }
    currentModel = object;
    scene.add(object);
    frameObject(object);
    $("viewer-placeholder").classList.add("hidden");
  } catch (error) {
    $("viewer-placeholder").classList.remove("hidden");
    $("viewer-placeholder").querySelector("strong").textContent = "Could not load this model";
    $("viewer-placeholder").querySelector("span").textContent = error.message || "Check that the file is a valid 3D model.";
  }
}

$("upload-form").addEventListener("submit", async event => {
  event.preventDefault();
  const file = $("model-file").files[0];
  if (!file) return setMessage("Choose a model file first.", true);
  const button = event.submitter;
  button.disabled = true;
  setMessage("Uploading model…");
  try {
    const form = new FormData();
    form.append("model", file);
    const response = await fetch("/api/upload", { method: "POST", body: form, credentials: "include" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed.");
    setMessage(`Uploaded ${result.name}`);
    $("upload-form").reset();
    $("file-label").textContent = "Choose a 3D model";
    await loadModels();
    const uploaded = models.find(model => model.key === result.key);
    if (uploaded) selectModel(uploaded);
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});

$("model-file").addEventListener("change", event => {
  $("file-label").textContent = event.target.files[0]?.name || "Choose a 3D model";
});
$("refresh-btn").addEventListener("click", loadModels);
$("reset-view").addEventListener("click", () => {
  if (currentModel) frameObject(currentModel);
});

initViewer();
checkAdmin();
loadModels();
