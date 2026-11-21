import {createClient} from "https://esm.sh/@supabase/supabase-js@2.57.4";
const cfg=window.TRIBUNE_CONFIG||{};
const root=document.getElementById("content");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const date=v=>v?new Intl.DateTimeFormat("bn-BD",{dateStyle:"medium"}).format(new Date(v)):"";
const img=(n,cls="")=>n.featured_image?'<img class="'+cls+'" src="'+esc(n.featured_image)+'" alt="'+esc(n.image_alt||n.title)+'" loading="lazy">':'<div class="'+cls+' placeholder"></div>';
const link=n=>"/post/"+encodeURIComponent(n.slug);
const meta=n=>'<span class="tag">'+esc(n.categories?.name||"সংবাদ")+'</span> <span class="date">'+esc(date(n.published_at))+'</span>';
const empty='<div class="empty">এই মুহূর্তে প্রকাশিত সংবাদ পাওয়া যায়নি।</div>';
function card(n){return '<article class="news-card"><a href="'+link(n)+'">'+img(n)+'</a><div class="body">'+meta(n)+'<h3><a href="'+link(n)+'">'+esc(n.title)+'</a></h3><p>'+esc(n.excerpt||"")+'</p></div></article>';}
function compact(n){return '<article class="compact"><a href="'+link(n)+'">'+img(n)+'</a><div>'+meta(n)+'<h3><a href="'+link(n)+'">'+esc(n.title)+'</a></h3></div></article>';}
function section(title,href,body){return '<section><div class="section-head"><h2>'+esc(title)+'</h2><a href="'+href+'">আরও সংবাদ ›</a></div>'+body+'</section>';}
async function load(){
 if(!cfg.supabaseUrl||!cfg.supabasePublishableKey)throw new Error("সাইটের প্রকাশ্য ডেটা সংযোগ পাওয়া যায়নি");
 const db=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
 const base=()=>db.from("news").select("id,title,slug,excerpt,featured_image,image_alt,published_at,view_count,categories(name,slug)").eq("status","published").not("published_at","is",null).lte("published_at",new Date().toISOString());
 const [latestResult,popularResult,catsResult]=await Promise.all([
  base().order("published_at",{ascending:false}).limit(20),
  base().order("view_count",{ascending:false}).limit(10),
  db.from("categories").select("id,name,slug").eq("is_active",true).order("sort_order",{ascending:true})
 ]);
 if(latestResult.error)throw latestResult.error;if(popularResult.error)throw popularResult.error;if(catsResult.error)throw catsResult.error;
 const latest=latestResult.data||[],popular=popularResult.data||[],cats=catsResult.data||[];
 document.getElementById("date").textContent=new Intl.DateTimeFormat("bn-BD",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date());
 document.getElementById("year").textContent=new Date().getFullYear();
 document.getElementById("ticker-text").textContent=latest.slice(0,5).map(n=>n.title).join("  •  ")||"সর্বশেষ সংবাদ জানতে চোখ রাখুন ট্রিবিউন বাংলায়";
 if(!latest.length){root.innerHTML=empty;return;}
 const hero=latest[0],side=latest.slice(1,3),recent=latest.slice(3,7),mini=latest.slice(7,12);
 const heroHtml='<div class="lead-grid"><article class="lead-main"><a href="'+link(hero)+'">'+img(hero)+'</a><div class="lead-copy">'+meta(hero)+'<h1><a href="'+link(hero)+'" style="color:inherit;text-decoration:none">'+esc(hero.title)+'</a></h1><p>'+esc(hero.excerpt||"")+'</p></div></article><div class="lead-side">'+(side.map(n=>'<article class="lead-small"><a href="'+link(n)+'">'+img(n)+'</a><div>'+meta(n)+'<h3><a href="'+link(n)+'">'+esc(n.title)+'</a></h3></div></article>').join("")||empty)+'</div></div>';
 const recentHtml=section("সর্বশেষ সংবাদ","/search",'<div class="recent-grid">'+(recent.map(card).join("")||empty)+'</div>');
 const miniHtml='<div class="compact-list">'+mini.map(compact).join("")+'</div>';
 const popularHtml='<section class="sidebar-box"><h2>জনপ্রিয় সংবাদ</h2><ol class="ranked">'+(popular.map((n,i)=>'<li><b>'+String(i+1).padStart(2,"0")+'</b><a href="'+link(n)+'">'+esc(n.title)+'</a></li>').join("")||'<li>এখনো সংবাদ নেই</li>')+'</ol></section>';
 const latestHtml='<section class="sidebar-box"><h2>সর্বশেষ সংবাদ</h2><ol class="ranked">'+latest.slice(0,10).map((n,i)=>'<li><b>'+String(i+1).padStart(2,"0")+'</b><a href="'+link(n)+'">'+esc(n.title)+'</a></li>').join("")+'</ol></section>';
 const catRows=await Promise.all(cats.map(async c=>{const {data,error}=await db.from("news").select("id,title,slug,excerpt,featured_image,image_alt,published_at,categories(name,slug)").eq("status","published").not("published_at","is",null).lte("published_at",new Date().toISOString()).eq("category_id",c.id).order("published_at",{ascending:false}).limit(4);if(error)throw error;return {category:c,items:data||[]};}));
 const catHtml=catRows.filter(x=>x.items.length).map(x=>section(x.category.name,"/category/"+encodeURIComponent(x.category.slug),'<div class="category-grid">'+x.items.map(card).join("")+'</div>')).join("");
 root.innerHTML=heroHtml+'<div class="ad-slot">বিজ্ঞাপনের জন্য সংরক্ষিত স্থান</div><div class="columns"><div>'+recentHtml+catHtml+'</div><aside>'+popularHtml+'<div class="ad-slot">বিজ্ঞাপনের জন্য সংরক্ষিত স্থান</div>'+latestHtml+'</aside></div>';
}
load().catch(error=>{console.error(error);root.innerHTML='<div class="error"><b>নতুন ডিজাইন প্রিভিউ লোড হয়নি</b><p>'+esc(error.message||"অজানা সমস্যা")+'</p><p>মূল ওয়েবসাইটের সংবাদ ও বিভাগ সংযোগ যাচাই করুন।</p></div>';});
