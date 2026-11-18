(() => {
'use strict';
const app=document.getElementById('app');
document.getElementById('year').textContent=String(new Date().getFullYear());
const routes=[
{id:'home',path:'/',title:'সর্বশেষ সংবাদ'},
{id:'category',pattern:/^\/category\/([^/]+)\/?$/,title:'বিভাগভিত্তিক সংবাদ'},
{id:'article',pattern:/^\/post\/([^/]+)\/?$/,title:'সংবাদের বিস্তারিত'},
{id:'search',path:'/search',title:'সংবাদ অনুসন্ধান'},
{id:'reporter',pattern:/^\/reporter\/([^/]+)\/?$/,title:'প্রতিনিধির প্রোফাইল'},
{id:'login',path:'/login',title:'অ্যাকাউন্টে প্রবেশ'},
{id:'register',path:'/register',title:'পাঠক নিবন্ধন'},
{id:'reader',path:'/account',title:'পাঠক ড্যাশবোর্ড'},
{id:'reporterdesk',path:'/reporter/dashboard',title:'প্রতিনিধি ড্যাশবোর্ড'},
{id:'admin',path:'/admin',title:'এডমিন ড্যাশবোর্ড'},
{id:'newsmanage',path:'/admin/news',title:'সংবাদ ব্যবস্থাপনা'},
{id:'reportmanage',path:'/admin/reporters',title:'প্রতিনিধি ব্যবস্থাপনা'},
{id:'video',path:'/video',title:'ভিডিও সংবাদ'},
{id:'epaper',path:'/epaper',title:'ই-পেপার'},
{id:'contact',path:'/contact',title:'যোগাযোগ'},
{id:'about',path:'/about',title:'আমাদের সম্পর্কে'},
{id:'privacy',path:'/privacy',title:'গোপনীয়তা নীতি'},
{id:'404',path:'/404',title:'পেইজ পাওয়া যায়নি'}];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const heading=t=>'<header class="heading"><div><span class="eyebrow">TRIBUNE BANGLA</span><h1>'+esc(t)+'</h1></div></header>';
const empty=t=>'<div class="empty"><b>'+esc(t||'এখনো কোনো সংবাদ প্রকাশিত হয়নি')+'</b><p>ডেটাবেজ ও সম্পাদকীয় প্রকাশনা ব্যবস্থা যুক্ত হলে অনুমোদিত কনটেন্ট এখানে প্রদর্শিত হবে।</p></div>';
function resolve(path){let r=routes.find(x=>x.path===path);if(r)return {...r,params:[]};for(const x of routes){const m=x.pattern&&path.match(x.pattern);if(m)return {...x,params:m.slice(1)};}return {...routes.at(-1),params:[]};}
function formField(label,name,type='text'){return '<label class="field">'+label+'<input name="'+name+'" type="'+type+'" required></label>';}
function render(r){
if(r.id==='home')return heading('সর্বশেষ সংবাদ')+'<div class="homegrid"><section class="hero"><div><span class="eyebrow">TRIBUNE BANGLA</span><h2>মানুষের কথা, সময়ের সংবাদ</h2><p class="muted">সত্য ও ন্যায়ের পক্ষে, মানুষের কথা তুলে ধরাই আমাদের অঙ্গীকার।</p></div></section><aside class="stack"><div class="panel"><b>শীর্ষ সংবাদ</b><p class="muted">অনুমোদিত প্রধান সংবাদ এখানে দেখানো হবে।</p></div><div class="panel"><b>সর্বশেষ আপডেট</b><p class="muted">নতুন প্রকাশিত সংবাদ এখানে দেখানো হবে।</p></div></aside></div><section class="section"><h2>সর্বশেষ সংবাদ</h2><div class="cards"><div class="card"><div class="placeholder"></div><p class="muted">প্রকাশিত সংবাদ এখানে দেখাবে।</p></div><div class="card"><div class="placeholder"></div><p class="muted">বিভাগভিত্তিক সংবাদ এখানে দেখাবে।</p></div><div class="card"><div class="placeholder"></div><p class="muted">বিশেষ প্রতিবেদন এখানে দেখাবে।</p></div></div></section>';
if(r.id==='login'||r.id==='register')return heading(r.title)+'<section class="formpanel"><form class="formgrid" data-pending>'+ (r.id==='register'?formField('পূর্ণ নাম','full_name'):'')+formField('মোবাইল নম্বর','phone','tel')+formField('পাসওয়ার্ড','password','password')+(r.id==='register'?formField('পাসওয়ার্ড নিশ্চিত করুন','password_confirm','password'):'')+'<div><button class="btn" type="submit">'+(r.id==='login'?'লগইন':'নিবন্ধন')+'</button></div></form></section>';
if(r.id==='search')return heading(r.title)+'<section class="formpanel"><form class="formgrid" data-pending>'+formField('কী খুঁজতে চান?','q','search')+'<div><button class="btn">খুঁজুন</button></div></form></section>'+empty('অনুসন্ধানের ফলাফলের জন্য ডেটাবেজ সংযোগ প্রয়োজন।');
if(r.id==='contact')return heading(r.title)+'<section class="formpanel"><form class="formgrid" data-pending>'+formField('আপনার নাম','name')+formField('মোবাইল / ইমেইল','contact')+formField('বিষয়','subject')+'<label class="field">বার্তা<textarea name="message" required></textarea></label><div><button class="btn">বার্তা পাঠান</button></div></form></section>';
if(r.id==='404')return '<section class="panel"><h1>৪০৪ — পেইজ পাওয়া যায়নি</h1><a href="/">হোম পেইজে ফিরুন</a></section>';
if(r.id==='about')return heading(r.title)+'<section class="panel"><p>ট্রিবিউন বাংলা একটি সংবাদমাধ্যম। সত্য ও ন্যায়ের পক্ষে, মানুষের কথা তুলে ধরাই আমাদের অঙ্গীকার।</p></section>';
if(r.id==='privacy')return heading(r.title)+'<section class="panel"><p>পাঠকের তথ্যের গোপনীয়তা ও নিরাপত্তা রক্ষা আমাদের অঙ্গীকার।</p></section>';
if(r.id==='article')return heading(r.title+' — '+(r.params[0]||''))+empty('এই সংবাদের তথ্য এখনো পাওয়া যায়নি।');
if(r.id==='category')return heading(r.title+' — '+(r.params[0]||''))+empty();
if(r.id==='reporter')return heading(r.title)+empty('প্রতিনিধির তথ্য ডেটাবেজ সংযুক্ত হলে দেখানো হবে।');
if(r.id==='video'||r.id==='epaper')return heading(r.title)+empty('এই বিভাগে এখনো কোনো কনটেন্ট যুক্ত হয়নি।');
return heading(r.title)+'<div class="notice">এই ড্যাশবোর্ডটি অনুমোদিত ব্যবহারকারীর জন্য। ভূমিকা ও সার্ভার-সাইড অনুমতি যাচাই যুক্ত না হওয়া পর্যন্ত প্রশাসনিক কার্যক্রম চালু করা হয়নি।</div>'+empty('নিরাপদ ডেটাবেজ সংযোগের পর এই ড্যাশবোর্ড সক্রিয় হবে।');
}
function show(){const r=resolve(location.pathname);app.innerHTML=render(r);document.title=r.title+' | ট্রিবিউন বাংলা';document.querySelectorAll('.nav a').forEach(a=>a.toggleAttribute('aria-current',a.getAttribute('href')===location.pathname));}
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="/"]');if(!a||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;const u=new URL(a.href,location.origin);if(u.origin!==location.origin)return;e.preventDefault();history.pushState({},'',u.pathname);show();scrollTo(0,0);});
addEventListener('popstate',show);
document.addEventListener('submit',e=>{if(!e.target.matches('form[data-pending]'))return;e.preventDefault();const p=document.createElement('p');p.className='notice';p.textContent='এই ফর্মটি এখনো ব্যাকএন্ডের সঙ্গে যুক্ত নয়। নিরাপদ সার্ভার সংযোগ সম্পন্ন হলে কার্যক্রম চালু হবে।';e.target.append(p);});
show();
})();
