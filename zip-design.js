(() => {
  'use strict';
  const root = document.createElement('div');
  root.id = 'tbzip-root';
  document.body.classList.add('tbzip-active');
  document.body.append(root);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => { if(!value) return ''; const d=new Date(value); return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('bn-BD',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Dhaka'}).format(d); };
  const img = a => a.image || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 800 500%22%3E%3Crect width=%22800%22 height=%22500%22 fill=%22%23f0f2f5%22/%3E%3C/svg%3E';
  const postUrl = a => a.path && /^\/post\/\d+\/?$/.test(a.path) ? a.path : '/post/'+encodeURIComponent(a.id)+'/';
  const card = a => '<a class="news-card" href="'+esc(postUrl(a))+'"><img src="'+esc(img(a))+'" alt="'+esc(a.title)+'" loading="lazy" onerror="this.remove()"><div class="pad"><span class="meta">'+esc(a.category||'সর্বশেষ')+'</span><h3>'+esc(a.title)+'</h3><p>'+esc(a.summary||'')+'</p></div></a>';
  const mini = a => '<a class="side-story" href="'+esc(postUrl(a))+'"><img src="'+esc(img(a))+'" alt="" loading="lazy" onerror="this.remove()"><div><h3>'+esc(a.title)+'</h3><div class="meta">'+date(a.publishedAt)+'</div></div></a>';
  const shell = () => '<div class="topline"><div class="wrap"><span>সত্য ও ন্যায়ের প্রতিচ্ছবি</span><div class="toplinks"><a href="/about-us/">আমাদের সম্পর্কে</a><a href="/contact/">যোগাযোগ</a><a href="/login/">লগইন</a><a href="/account/">আমার অ্যাকাউন্ট</a></div></div></div><header class="brandbar"><div class="wrap brandinner"><a class="brand" href="/" aria-label="ট্রিবিউন বাংলা"><img class="brand-mark-image" src="/assets/tribune-mark.svg" alt=""><img class="brand-wordmark-image" src="/assets/tribune-wordmark.svg" alt="ট্রিবিউন বাংলা"></a><form class="search" id="tbzip-search"><input name="q" placeholder="খবর খুঁজুন..." aria-label="খবর খুঁজুন"><button aria-label="সার্চ">⌕</button></form></div></header><nav class="nav"><div class="wrap"><a class="active" href="/">প্রচ্ছদ</a><a href="/national/">জাতীয়</a><a href="/politics/">রাজনীতি</a><a href="/country/">সারাদেশ</a><a href="/international/">আন্তর্জাতিক</a><a href="/economy/">অর্থনীতি</a><a href="/sports/">খেলা</a><a href="/entertainment/">বিনোদন</a><a href="/technology/">প্রযুক্তি</a><a href="/videos/">ভিডিও</a><a href="/epaper/">ই-পেপার</a><a href="/reporter-dashboard/">প্রতিনিধি</a></div></nav>';
  const footer = () => '<footer class="footer"><div class="wrap"><div class="footergrid"><div class="footer-about"><a class="footer-brand" href="/" aria-label="ট্রিবিউন বাংলা"><img class="footer-mark-image" src="/assets/tribune-mark.svg" alt="" aria-hidden="true"><img class="footer-wordmark" src="/assets/tribune-wordmark.svg" alt="ট্রিবিউন বাংলা — সংবাদে সত্য, প্রতিবেদনে দায়িত্ব"></a></div><div><h3>গুরুত্বপূর্ণ</h3><a href="/about/">আমাদের সম্পর্কে</a><a href="/contact/">যোগাযোগ</a><a href="/privacy-policy/">গোপনীয়তা নীতি</a><a href="/account/">আমার অ্যাকাউন্ট</a></div><div><h3>অনুসরণ করুন</h3><a href="https://www.facebook.com/tribunebangla" rel="noopener">ফেসবুক</a><a href="https://www.youtube.com/tribunebangla" rel="noopener">ইউটিউব</a></div></div><div class="copyright">© ট্রিবিউন বাংলা — সর্বস্বত্ব সংরক্ষিত</div></div></footer>';
  let articles = [];
  async function loadArticles(){
    try {
      const response=await fetch('/articles.json?v='+Date.now(),{cache:'no-store'});
      if(!response.ok) throw new Error('Article feed unavailable');
      const data=await response.json();
      const records=Array.isArray(data)?data:(Array.isArray(data.articles)?data.articles:[]);
      articles=records.filter(a=>a && a.status!=='draft' && a.status!=='deleted');
    } catch(error) { console.error('Tribune redesign feed:',error); }
    try {
      const response=await fetch('https://rvffsavdvetdmhnwgivz.supabase.co/rest/v1/news_articles?select=id,title,summary,body,image_url,category,status,reporter,body_alignment,image_caption,created_at,updated_at&status=eq.published&order=created_at.desc',{
        headers:{apikey:'sb_publishable_K4ir8_k1DY9EOhoC-wUT8A_8r01CJxu',Authorization:'Bearer sb_publishable_K4ir8_k1DY9EOhoC-wUT8A_8r01CJxu'},cache:'no-store'
      });
      if(response.ok){
        const rows=await response.json();
        if(Array.isArray(rows)){
          const fromDb=rows.map(r=>({id:String(r.id),path:'/post/'+r.id+'/',title:r.title||'',summary:r.summary||'',body:r.body||'',image:r.image_url||'',image_url:r.image_url||'',image_caption:r.image_caption||'',reporter:r.reporter||'',body_alignment:r.body_alignment||'justify',category:r.category||'',status:r.status,publishedAt:r.created_at||''}));
          const seen=new Set(fromDb.map(a=>String(a.id)));
          articles=[...fromDb,...articles.filter(a=>!seen.has(String(a.id)))];
        }
      }
    } catch(error) { console.warn('Published database stories unavailable; using article feed.',error); }
    articles.sort((a,b)=>new Date(b.publishedAt||b.created_at||0)-new Date(a.publishedAt||a.created_at||0));
  }
  function home(){
    document.title='ট্রিবিউন বাংলা | সংবাদে সত্য, প্রতিবেদনে দায়িত্ব';
    const a=articles;
    root.innerHTML=shell()+'<main class="wrap"><div class="breaking"><b>ব্রেকিং নিউজ</b><span id="tbzip-breaking">'+(a[0]?esc(a[0].title):'সর্বশেষ সংবাদ লোড হচ্ছে...')+'</span></div><section class="hero-grid" id="tbzip-hero"></section><div class="ad-slot">বিজ্ঞাপনের স্থান · 970 × 90</div><div class="content-grid"><div><div class="sectionhead"><h2>সর্বশেষ সংবাদ</h2><a href="/search/">সব খবর →</a></div><div class="news-grid" id="tbzip-latest"></div><section id="national"><div class="sectionhead"><h2>জাতীয়</h2></div><div class="news-grid" id="tbzip-national"></div></section><section id="country"><div class="sectionhead"><h2>সারাদেশ</h2></div><div class="news-grid" id="tbzip-country"></div></section></div><aside><div class="sidebar-box"><h3>সর্বাধিক পঠিত</h3><ol class="rank-list" id="tbzip-popular"></ol></div><div class="sidebar-box"><h3>বিভাগসমূহ</h3><div>জাতীয় · রাজনীতি · সারাদেশ · আন্তর্জাতিক · অর্থনীতি · খেলা · বিনোদন · প্রযুক্তি</div></div><div class="ad-slot">বিজ্ঞাপনের স্থান · 300 × 250</div></aside></div></main>'+footer();
    if(!a.length){root.querySelector('#tbzip-hero').innerHTML='<div class="empty">সংবাদ লোড করা যায়নি। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।</div>';return;}
    root.querySelector('#tbzip-hero').innerHTML='<a class="hero" href="'+esc(postUrl(a[0]))+'"><img src="'+esc(img(a[0]))+'" alt="" onerror="this.remove()"><div class="hero-copy"><span class="kicker">'+esc(a[0].category||'প্রধান খবর')+'</span><h1>'+esc(a[0].title)+'</h1><p>'+esc(a[0].summary||'')+'</p></div></a><div class="side-stack">'+a.slice(1,4).map(mini).join('')+'</div>';
    root.querySelector('#tbzip-latest').innerHTML=a.slice(0,9).map(card).join('');
    const national=a.filter(x=>(x.category||'').includes('জাতীয়'));
    root.querySelector('#tbzip-national').innerHTML=(national.length?national:a.slice(9,15)).slice(0,3).map(card).join('');
    root.querySelector('#tbzip-country').innerHTML=a.filter(x=>(x.category||'').includes('সারাদেশ')||(x.category||'').includes('স্থানীয়')).slice(0,3).map(card).join('')||a.slice(15,18).map(card).join('');
    root.querySelector('#tbzip-popular').innerHTML=a.slice(0,5).map(x=>'<li><a href="'+esc(postUrl(x))+'">'+esc(x.title)+'</a></li>').join('');
  }
  async function article(id){
    let item=articles.find(a=>String(a.id)===String(id));
    // Always hydrate an individual story from the database when its full body or image is absent.
    if(!item || !String(item.body||'').trim() || !(item.image||item.image_url)){
      try{
        const response=await fetch('https://rvffsavdvetdmhnwgivz.supabase.co/rest/v1/news_articles?select=id,title,summary,body,image_url,image_caption,reporter,body_alignment,category,status,created_at&id=eq.'+encodeURIComponent(id)+'&status=eq.published&limit=1',{
          headers:{apikey:'sb_publishable_K4ir8_k1DY9EOhoC-wUT8A_8r01CJxu',Authorization:'Bearer sb_publishable_K4ir8_k1DY9EOhoC-wUT8A_8r01CJxu'},cache:'no-store'
        });
        if(response.ok){
          const rows=await response.json();
          if(rows[0]){
            const r=rows[0];
            item={...(item||{}),id:String(r.id),title:r.title||'',summary:r.summary||'',body:r.body||'',image:r.image_url||'',image_url:r.image_url||'',image_caption:r.image_caption||'',reporter:r.reporter||'',body_alignment:r.body_alignment||'justify',category:r.category||'',status:r.status,publishedAt:r.created_at||''};
          }
        }
      }catch(error){console.error('Unable to load full story:',error);}
    }
    if(!item){root.innerHTML=shell()+'<main class="wrap"><div class="empty">খবরটি পাওয়া যায়নি। <a href="/">প্রচ্ছদে ফিরুন</a></div></main>'+footer();return;}
    document.title=item.title+' | ট্রিবিউন বাংলা';
    const bodyText=String(item.body||item.summary||'').trim();
    const paras=bodyText.split(/\n{2,}|\n/).map(p=>p.trim()).filter(Boolean);
    const cover=item.image||item.image_url||'';
    const reporter=item.reporter||item.author||item.byline||'ট্রিবিউন বাংলা ডেস্ক';
    root.innerHTML=shell()+'<main class="wrap" style="padding-top:22px"><div class="article-layout"><article class="article"><div class="crumb"><a href="/">প্রচ্ছদ</a> / '+esc(item.category||'সংবাদ')+'</div><span class="kicker">'+esc(item.category||'সংবাদ')+'</span><h1>'+esc(item.title)+'</h1><p class="article-deck">'+esc(item.summary||'')+'</p><div class="byline"><span class="author-avatar" aria-hidden="true">'+esc(reporter.trim().slice(0,1))+'</span><span class="author-meta"><strong><a href="/reporter/'+encodeURIComponent(reporter)+'/">'+esc(reporter)+'</a></strong><small>প্রতিবেদক · ট্রিবিউন বাংলা</small></span><time>'+date(item.publishedAt||item.created_at)+'</time></div>'+(cover?'<figure class="article-figure"><img class="article-cover" src="'+esc(cover)+'" alt="'+esc(item.image_caption||item.title)+'" onerror="this.closest(\'figure\').remove()">'+(item.image_caption?'<figcaption class="caption">'+esc(item.image_caption)+'</figcaption>':(item.imageType==='ai_generated'?'<figcaption class="caption">কৃত্রিমভাবে তৈরি প্রতীকী ছবি</figcaption>':'<figcaption class="caption">ছবি: সংগৃহীত</figcaption>'))+'</figure>':'')+'<div class="share"><button type="button" data-copy-url>লিংক কপি</button><button type="button" onclick="window.print()">প্রিন্ট</button></div><div class="article-body" style="text-align:'+esc(['justify','left','center'].includes(item.body_alignment)?item.body_alignment:'justify')+'">'+paras.map(p=>'<p>'+esc(p)+'</p>').join('')+'</div>'+(item.sourceUrl?'<div class="source-note">সংবাদসূত্র: '+esc(item.source||'সংবাদমাধ্যম')+' · <a href="'+esc(item.sourceUrl)+'" target="_blank" rel="noopener noreferrer">মূল প্রতিবেদন পড়ুন</a></div>':'')+'<div class="share"><button type="button" data-copy-url>সংবাদটি শেয়ার করুন</button></div></article><aside><div class="sidebar-box"><h3>সর্বশেষ সংবাদ</h3>'+articles.filter(x=>String(x.id)!==String(item.id)).slice(0,6).map(mini).join('')+'</div><div class="ad-slot">বিজ্ঞাপনের স্থান · 300 × 250</div></aside></div></main>'+footer();
  }
  function search(query){
    const q=String(query||'').trim().toLocaleLowerCase();
    const matches=q?articles.filter(a=>(a.title+' '+(a.summary||'')+' '+(a.body||'')).toLocaleLowerCase().includes(q)):[];
    root.innerHTML=shell()+'<main class="wrap"><div class="sectionhead"><h2>অনুসন্ধানের ফলাফল</h2></div><form class="search-results-form" id="tbzip-search-results"><input name="q" value="'+esc(query||'')+'" placeholder="শিরোনাম বা বিষয় লিখুন" aria-label="সংবাদ অনুসন্ধান"><button type="submit">খুঁজুন</button></form><div class="news-grid">'+matches.map(card).join('')+'</div>'+(matches.length?'':'<div class="empty">কোনো সংবাদ পাওয়া যায়নি।</div>')+'</main>'+footer();
    root.querySelector('#tbzip-search-results')?.addEventListener('submit',e=>{e.preventDefault();const q=new FormData(e.currentTarget).get('q');location.href='/search/?q='+encodeURIComponent(q||'');});
  }


  const categoryLabels = {
    national:'জাতীয়', politics:'রাজনীতি', international:'আন্তর্জাতিক', economy:'অর্থনীতি',
    country:'সারাদেশ', dhaka:'ঢাকা', chattogram:'চট্টগ্রাম', rajshahi:'রাজশাহী',
    khulna:'খুলনা', barishal:'বরিশাল', sylhet:'সিলেট', rangpur:'রংপুর',
    mymensingh:'ময়মনসিংহ', technology:'প্রযুক্তি', sports:'খেলাধুলা', entertainment:'বিনোদন',
    education:'শিক্ষা', health:'স্বাস্থ্য', islam:'ইসলাম', 'islam-religion':'ইসলামিক খবর'
  };
  function category(slug){
    const label=categoryLabels[slug]||'সংবাদ';
    const aliases={
      national:['জাতীয়','জাতীয়'], politics:['রাজনীতি'], international:['আন্তর্জাতিক'],
      economy:['অর্থনীতি','ব্যবসা'], country:['সারাদেশ','স্থানীয়','স্থানীয়','জেলা'],
      dhaka:['ঢাকা'], chattogram:['চট্টগ্রাম'], rajshahi:['রাজশাহী'], khulna:['খুলনা'],
      barishal:['বরিশাল'], sylhet:['সিলেট'], rangpur:['রংপুর'], mymensingh:['ময়মনসিংহ','ময়মনসিংহ'], technology:['প্রযুক্তি','প্রযুক্তি সংবাদ'],
      sports:['খেলাধুলা','খেলা','ক্রিকেট','ফুটবল'], entertainment:['বিনোদন'],
      education:['শিক্ষা'], health:['স্বাস্থ্য'], islam:['ইসলাম'], 'islam-religion':['ইসলামিক']
    };
    const terms=aliases[slug]||[label];
    const matches=articles.filter(a=>terms.some(term=>String(a.category||'').includes(term)));
    document.title=label+' সংবাদ | ট্রিবিউন বাংলা';
    root.innerHTML=shell()+'<main class="wrap"><div class="crumb"><a href="/">প্রচ্ছদ</a> / '+esc(label)+'</div><div class="sectionhead"><h2>'+esc(label)+' সংবাদ</h2><span class="meta">'+matches.length+'টি প্রতিবেদন</span></div><div class="news-grid">'+matches.map(card).join('')+'</div>'+(matches.length?'':'<div class="empty">এই বিভাগে এখনো কোনো প্রকাশিত সংবাদ পাওয়া যায়নি। নতুন প্রতিবেদন প্রকাশ হলে এখানে দেখা যাবে।</div>')+'</main>'+footer();
    applyBrandLogo();
  }
  function reporter(slug){
    let name=''; try{name=decodeURIComponent(slug).replace(/[-_]+/g,' ').trim();}catch(_){name=slug;}
    const key=name.toLocaleLowerCase('bn-BD');
    const matches=articles.filter(a=>[a.reporter,a.author,a.byline].some(v=>String(v||'').trim().toLocaleLowerCase('bn-BD')===key));
    document.title=name+' | প্রতিবেদক | ট্রিবিউন বাংলা';
    root.innerHTML=shell()+'<main class="wrap"><div class="crumb"><a href="/">প্রচ্ছদ</a> / প্রতিনিধি</div><section class="info-panel reporter-panel"><span class="kicker">ট্রিবিউন বাংলা</span><h1>'+esc(name)+'</h1><p>প্রকাশিত প্রতিবেদন</p></section><div class="sectionhead"><h2>প্রতিবেদনসমূহ</h2></div><div class="news-grid">'+matches.map(card).join('')+'</div>'+(matches.length?'':'<div class="empty">এই প্রতিনিধির নামে কোনো প্রকাশিত প্রতিবেদন পাওয়া যায়নি।</div>')+'</main>'+footer();
    applyBrandLogo();
  }
  function videoPage(){
    const matches=articles.filter(a=>/ভিডিও|video/i.test(String(a.category||'')+' '+String(a.title||''))||a.video_url);
    document.title='ভিডিও সংবাদ | ট্রিবিউন বাংলা';
    root.innerHTML=shell()+'<main class="wrap"><div class="crumb"><a href="/">প্রচ্ছদ</a> / ভিডিও সংবাদ</div><div class="sectionhead"><h2>ভিডিও সংবাদ</h2></div><div class="news-grid">'+matches.map(card).join('')+'</div>'+(matches.length?'':'<div class="empty">ভিডিও প্রতিবেদন প্রকাশিত হলে এখানে দেখা যাবে। আপাতত সর্বশেষ লিখিত সংবাদ পড়ুন। <a href="/search/">সংবাদ খুঁজুন</a></div>')+'</main>'+footer();
    applyBrandLogo();
  }
  function epaperPage(){
    document.title='ই-পেপার | ট্রিবিউন বাংলা';
    root.innerHTML=shell()+'<main class="wrap"><div class="crumb"><a href="/">প্রচ্ছদ</a> / ই-পেপার</div><section class="info-panel"><span class="kicker">ডিজিটাল সংস্করণ</span><h1>ট্রিবিউন বাংলা ই-পেপার</h1><p>ই-পেপারের প্রকাশিত সংস্করণ এখানে সংরক্ষণ করা হবে। বর্তমানে কোনো ই-পেপার ফাইল প্রকাশিত নেই।</p><a class="action-link" href="/">সর্বশেষ সংবাদ পড়ুন</a></section></main>'+footer();
    applyBrandLogo();
  }
  function infoPage(kind){
    const data={
      about:{title:'আমাদের সম্পর্কে',body:'ট্রিবিউন বাংলা একটি অনলাইন সংবাদমাধ্যম। সত্য ও ন্যায়ের পক্ষে, মানুষের কথা তুলে ধরাই আমাদের অঙ্গীকার। জনস্বার্থ, নির্ভরযোগ্য তথ্য ও দায়িত্বশীল সাংবাদিকতাকে গুরুত্ব দিয়ে সংবাদ প্রকাশ করা হয়।'},
      contact:{title:'যোগাযোগ',body:'সংবাদ, সংশোধনী, পাঠকের মতামত অথবা প্রতিনিধি হওয়ার আবেদন জানাতে পাঠক অ্যাকাউন্টে প্রবেশ করে বার্তা ও প্রতিবেদন জমা দিন। সম্পাদকীয় দলের জন্য আলাদা প্রবেশপথ রয়েছে।'},
      privacy:{title:'গোপনীয়তা নীতি',body:'পাঠক অ্যাকাউন্টে দেওয়া তথ্য অ্যাকাউন্ট পরিচালনা, নিরাপত্তা এবং পাঠক-সেবা প্রদানের জন্য ব্যবহৃত হয়। অপ্রয়োজনীয় ব্যক্তিগত তথ্য প্রকাশ করা হয় না। অ্যাকাউন্ট ও তথ্য-সংক্রান্ত অনুরোধের জন্য যোগাযোগ পাতা ব্যবহার করুন।'}
    }[kind];
    document.title=data.title+' | ট্রিবিউন বাংলা';
    root.innerHTML=shell()+'<main class="wrap"><div class="crumb"><a href="/">প্রচ্ছদ</a> / '+esc(data.title)+'</div><section class="info-panel"><span class="kicker">ট্রিবিউন বাংলা</span><h1>'+esc(data.title)+'</h1><p>'+esc(data.body)+'</p><div class="info-actions"><a class="action-link" href="/account/">পাঠক অ্যাকাউন্ট</a><a class="action-link secondary" href="/editor/">সম্পাদকীয় প্যানেল</a></div></section></main>'+footer();
    applyBrandLogo();
  }
  function notFound(){
    document.title='পেইজ পাওয়া যায়নি | ট্রিবিউন বাংলা';
    root.innerHTML=shell()+'<main class="wrap"><section class="info-panel not-found"><strong>404</strong><h1>পেইজটি পাওয়া যায়নি</h1><p>আপনি যে ঠিকানাটি খুঁজছেন সেটি পাওয়া যায়নি অথবা সরানো হয়েছে।</p><a class="action-link" href="/">প্রচ্ছদে ফিরুন</a></section></main>'+footer();
    applyBrandLogo();
  }
  let brandingPromise;
  async function applyBrandLogo(){
    if(!brandingPromise){
      brandingPromise=fetch('/brand.json?v='+Date.now(),{cache:'no-store'})
        .then(response=>response.ok?response.json():null).catch(()=>null);
    }
    const settings=await brandingPromise;
    const brand=root.querySelector('.brand');
    const logo=brand?.querySelector('img');
    if(settings?.logo){
      if(logo){
        logo.src=settings.logo;
        logo.alt='ট্রিবিউন বাংলা লোগো';
        brand.classList.add('has-custom-logo');
      }
      const footerMark=root.querySelector('.footer-brand .footer-mark-image');
      if(footerMark){
        footerMark.src=settings.logo;
        footerMark.alt='ট্রিবিউন বাংলা আইকন';
      }
      const footerWordmark=root.querySelector('.footer-brand .footer-wordmark');
      if(footerWordmark){
        footerWordmark.src='/assets/tribune-wordmark.svg';
        footerWordmark.alt='ট্রিবিউন বাংলা';
      }
      document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]').forEach(link => { link.href = settings.logo; });
    }
  }
  function render(){
    const path=location.pathname.replace(/\/+$/,'')||'/';
    if(/^\/post\/\d+$/.test(path)) void article(path.match(/\d+/)[0]);
    else if(path==='/search') search(new URLSearchParams(location.search).get('q'));
    else if(categoryLabels[path.replace(/^\//,'')]) category(path.replace(/^\//,''));
    else if(path==='/videos'||path==='/video-news') videoPage();
    else if(path==='/epaper') epaperPage();
    else if(path==='/about-us'||path==='/about') infoPage('about');
    else if(path==='/contact') infoPage('contact');
    else if(path==='/privacy-policy'||path==='/privacy') infoPage('privacy');
    else if(path==='/404') notFound();
    else if(/^\/reporter\//.test(path)) reporter(path.split('/').filter(Boolean).slice(1).join('/'));
    else home();
    const form=root.querySelector('#tbzip-search');
    form?.addEventListener('submit',e=>{e.preventDefault();const q=new FormData(form).get('q');location.href='/search/?q='+encodeURIComponent(q||'');});
    applyBrandLogo();
  }
  document.addEventListener('click',async e=>{
    const button=e.target.closest('[data-copy-url]');
    if(!button)return;
    try{await navigator.clipboard.writeText(location.href);button.textContent='লিংক কপি হয়েছে';}catch{button.textContent='লিংক কপি করা যায়নি';}
  });
  window.addEventListener('popstate',render);
  loadArticles().then(render);
})();