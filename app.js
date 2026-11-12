(() => {
const cfg=window.OS_CONFIG||{};
const $=id=>document.getElementById(id);
const hasConfig=cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&!cfg.SUPABASE_URL.includes("YOUR_")&&!cfg.SUPABASE_ANON_KEY.includes("YOUR_");
let sb=null,user=null,role="user",assets=[],selected=null,detailAsset=null;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const msg=(el,text)=>$(el).textContent=text;
function showAuth(){ $("authView").classList.remove("hidden");$("appView").classList.add("hidden")}
function showApp(){ $("authView").classList.add("hidden");$("appView").classList.remove("hidden")}
function notifyError(e){return e?.message||String(e)}
async function boot(){
 if(!hasConfig){
  $("setupNotice").classList.remove("hidden");
  $("setupNotice").textContent="Настройка не завершена: откройте config.js и укажите URL проекта и публичный anon/publishable key из Supabase.";
  showAuth();return;
 }
 if(!window.supabase || typeof window.supabase.createClient!=="function"){
  $("setupNotice").classList.remove("hidden");
  $("setupNotice").textContent="Не удалось загрузить библиотеку Supabase. Проверьте подключение к интернету и обновите страницу.";
  showAuth();return;
 }
 sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
 const {data:{session}}=await sb.auth.getSession();
 if(session) await enter(session.user); else showAuth();
 sb.auth.onAuthStateChange(async(event,session)=>{if(event==="SIGNED_OUT")showAuth();});
}
function usernameToEmail(value){
 const name=String(value||"").trim().toLowerCase().replace(/\\s+/g," ");
 const accounts={"otabek":"otabek@os-uchet.local","user 2":"user2@os-uchet.local","user2":"user2@os-uchet.local","user 3":"user3@os-uchet.local","user3":"user3@os-uchet.local"};
 if(name.includes("@")) return name;
 return accounts[name]||"";
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();msg("authError","");try{if(!sb){throw Error("Supabase ещё не подключён. Заполните config.js реальными данными проекта.");}const login=usernameToEmail($("email").value);if(!login)throw Error("Неизвестный логин. Используйте Otabek, User 2 или User 3.");let {data,error}=await sb.auth.signInWithPassword({email:login,password:$("password").value});if(error)throw error;await enter(data.user)}catch(err){msg("authError",notifyError(err))}});
$("logoutBtn").onclick=async()=>{if(sb) await sb.auth.signOut();user=null;showAuth()};
async function enter(u){
 user=u;
 const {data:profile,error}=await sb.from("profiles").select("role,display_name").eq("id",u.id).single();
 if(error){msg("authError","Профиль не найден. Проверьте SQL-настройку profiles.");await sb.auth.signOut();showAuth();return}
 role=profile.role||"user";
 $("userEmail").textContent=profile.display_name||u.email;
 $("userRole").textContent=role==="admin"?"Администратор":"Сотрудник";
 $("avatar").textContent=(profile.display_name||u.email||"О").slice(0,1).toUpperCase();
 $("usersNav").classList.toggle("hidden",role!=="admin");
 showApp();await loadAssets();
}
async function loadAssets(){
 const {data,error}=await sb.from("assets").select("*").order("created_at",{ascending:false});
 if(error){alert("Не удалось загрузить реестр: "+error.message);return}
 assets=data||[];renderAssets();
}
function renderAssets(){
 const q=$("searchInput").value.trim().toLowerCase();
 const shown=assets.filter(a=>[a.name,a.inventory_number,a.serial_number,a.room,a.responsible].some(x=>String(x||"").toLowerCase().includes(q)));
 $("assetRows").innerHTML="";
 shown.forEach(a=>{
  const tr=document.createElement("tr");
  const statusClass=a.status==="На ремонте"?"repair":a.status==="Отсутствует"?"absent":a.status==="Списано"?"scrap":"";
  tr.innerHTML=`<td><div class="asset-name">${esc(a.name)}</div><div class="subcell">${esc(a.serial_number||"Без серийного номера")}</div></td><td>${esc(a.inventory_number)}</td><td>${esc(a.room||"—")}</td><td>${esc(a.responsible||"—")}</td><td><span class="status ${statusClass}">${esc(a.status||"—")}</span></td><td>›</td>`;
  tr.onclick=()=>openDetail(a);$("assetRows").appendChild(tr);
 });
 $("emptyState").classList.toggle("hidden",shown.length!==0);
 $("shownCount").textContent=shown.length+" записей";
 $("totalCount").textContent=assets.length;
 $("availableCount").textContent=assets.filter(a=>["В наличии","В эксплуатации"].includes(a.status)).length;
 $("repairCount").textContent=assets.filter(a=>a.status==="На ремонте").length;
}
$("searchInput").addEventListener("input",renderAssets);
function openAssetModal(a=null){
 selected=a;
 $("assetForm").reset();$("assetError").textContent="";
 $("modalTitle").textContent=a?"Редактировать объект":"Новый объект";
 $("deleteAssetBtn").classList.toggle("hidden",!a||role!=="admin");
 $("currentPhotoWrap").classList.add("hidden");
 if(a){for(const k of ["name","inventory_number","serial_number","room","responsible","acceptance_date","status","comments"])$("assetForm").elements[k].value=a[k]||"";if(a.photo_path)showCurrentPhoto(a.photo_path)}
 $("assetModal").classList.remove("hidden");
}
async function showCurrentPhoto(path){
 const {data,error}=await sb.storage.from("asset-photos").createSignedUrl(path,3600);
 if(!error&&data?.signedUrl){$("currentPhoto").src=data.signedUrl;$("currentPhotoWrap").classList.remove("hidden")}
}
$("addBtn").onclick=()=>openAssetModal();
$("closeModal").onclick=$("cancelModal").onclick=()=>$("assetModal").classList.add("hidden");
$("assetForm").onsubmit=async e=>{
 e.preventDefault();$("assetError").textContent="";
 const f=new FormData(e.target),record={};
 ["name","inventory_number","serial_number","room","responsible","acceptance_date","status","comments"].forEach(k=>record[k]=String(f.get(k)||"").trim());
 record.serial_number=record.serial_number||null;record.room=record.room||null;record.responsible=record.responsible||null;record.acceptance_date=record.acceptance_date||null;record.comments=record.comments||null;
 try{
  let saved;
  if(selected){const {data,error}=await sb.from("assets").update(record).eq("id",selected.id).select().single();if(error)throw error;saved=data}
  else{const {data,error}=await sb.from("assets").insert(record).select().single();if(error)throw error;saved=data}
  const file=$("photoInput").files[0];
  if(file){
   if(file.size>8*1024*1024)throw Error("Фотография больше 8 МБ");
   if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Разрешены JPG, PNG и WEBP");
   const ext=file.name.split(".").pop().toLowerCase(),path=`${saved.id}/${crypto.randomUUID()}.${ext}`;
   const {error:upErr}=await sb.storage.from("asset-photos").upload(path,file,{upsert:false,contentType:file.type});
   if(upErr)throw upErr;
   const {error:saveErr}=await sb.from("assets").update({photo_path:path}).eq("id",saved.id);
   if(saveErr)throw saveErr;
  }
  $("assetModal").classList.add("hidden");$("photoInput").value="";await loadAssets();
 }catch(err){$("assetError").textContent=notifyError(err)}
};
$("deleteAssetBtn").onclick=async()=>{
 if(!selected||role!=="admin"||!confirm("Точно удалить этот объект?"))return;
 try{if(selected.photo_path)await sb.storage.from("asset-photos").remove([selected.photo_path]);const {error}=await sb.from("assets").delete().eq("id",selected.id);if(error)throw error;$("assetModal").classList.add("hidden");await loadAssets()}catch(e){$("assetError").textContent=notifyError(e)}
};
async function openDetail(a){
 detailAsset=a;$("detailTitle").textContent=a.name;
 const pairs=[["Инвентарный номер",a.inventory_number],["Серийный номер",a.serial_number],["Кабинет",a.room],["Ответственное лицо",a.responsible],["Дата принятия",a.acceptance_date],["Статус",a.status],["Комментарий",a.comments]];
 $("detailBody").innerHTML=`<div class="detail-grid">${pairs.map(([k,v])=>`<div class="detail-item"><small>${esc(k)}</small><b>${esc(v||"—")}</b></div>`).join("")}</div><div id="detailPhoto"></div>`;
 if(a.photo_path){const {data}=await sb.storage.from("asset-photos").createSignedUrl(a.photo_path,3600);if(data?.signedUrl)$("detailPhoto").innerHTML=`<img class="detail-photo" src="${data.signedUrl}" alt="Фото объекта">`}
 $("detailModal").classList.remove("hidden");
}
$("closeDetail").onclick=()=>$("detailModal").classList.add("hidden");
$("detailEdit").onclick=()=>{$("detailModal").classList.add("hidden");openAssetModal(detailAsset)};
$("detailQr").onclick=()=>showQr(detailAsset);
function showQr(a){$("qrTarget").innerHTML="";new QRCode($("qrTarget"),{text:a.inventory_number,width:190,height:190,colorDark:"#101b32",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});$("qrLabel").textContent=a.name+" · "+a.inventory_number;$("qrModal").classList.remove("hidden")}
$("closeQr").onclick=()=>$("qrModal").classList.add("hidden");$("printQr").onclick=()=>window.print();
$("exportBtn").onclick=()=>{
 const data=assets.map(a=>({"ID":a.id,"Наименование":a.name,"Инвентарный номер":a.inventory_number,"Серийный номер":a.serial_number,"Кабинет":a.room,"Ответственное лицо":a.responsible,"Дата принятия":a.acceptance_date,"Статус":a.status,"Комментарий":a.comments}));
 const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Основные средства");XLSX.writeFile(wb,"OS_UCHET.xlsx");
};
$("checkInventory").onclick=()=>{const n=$("inventoryNumber").value.trim();const a=assets.find(x=>x.inventory_number.toLowerCase()===n.toLowerCase());const out=$("inventoryResult");if(!n){out.textContent="Введите инвентарный номер.";return}if(a){out.innerHTML=`<b style="color:#21865a">✓ Объект найден</b><br>${esc(a.name)}<br>Кабинет: ${esc(a.room||"—")}<br>Ответственный: ${esc(a.responsible||"—")}<br>Статус: ${esc(a.status||"—")}`}else out.innerHTML='<b style="color:#c54450">Объект не найден в реестре</b>'};
$("inventoryNumber").addEventListener("keydown",e=>{if(e.key==="Enter")$("checkInventory").click()});
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelectorAll(".tab-content").forEach(x=>x.classList.add("hidden"));const tab=b.dataset.tab;$(tab+"Tab").classList.remove("hidden");$("pageTitle").textContent=tab==="assets"?"Основные средства":tab==="inventory"?"Инвентаризация":"Пользователи";if(tab==="users")loadUsers()});
async function loadUsers(){
 if(role!=="admin")return;
 const {data,error}=await sb.from("profiles").select("id,display_name,role,created_at").order("created_at");
 if(error){$("usersList").textContent=error.message;return}
 $("usersList").innerHTML=(data||[]).map(u=>`<div class="userline">${esc(u.display_name||"Сотрудник")} — ${esc(u.role)}</div>`).join("");
}
boot();
})();