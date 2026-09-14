// Load one player on demand. Removing the previous iframe stops its playback.
let activeVideo=null;
function closeExerciseVideo(restoreFocus=false){
  if(!activeVideo)return;
  const {button,panel}=activeVideo;
  panel.remove();button.setAttribute('aria-expanded','false');
  activeVideo=null;if(restoreFocus)button.focus();
}
document.querySelectorAll('.exercise a.video,.exercise a.extra-link').forEach((link,index)=>{
  const url=new URL(link.href);
  const id=url.searchParams.get('v');
  if(url.hostname!=='www.youtube.com'||!id||!/^[A-Za-z0-9_-]{11}$/.test(id))return;
  const start=Number.parseInt(url.searchParams.get('t')||'0',10);
  const button=document.createElement('button');button.type='button';
  button.className=link.className;button.innerHTML=link.innerHTML;
  button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-controls',`exercise-video-${index}`);
  const title=link.closest('.exercise').querySelector('h3').textContent;
  button.setAttribute('aria-label',link.getAttribute('aria-label')||`${title}: ${link.textContent}`);
  const source=link.href;link.replaceWith(button);
  button.addEventListener('click',()=>{
    if(activeVideo?.button===button){closeExerciseVideo();return;}
    closeExerciseVideo();
    const panel=document.createElement('div');panel.className='player-shell';panel.id=`exercise-video-${index}`;
    const frame=document.createElement('iframe');frame.title=`Видео: ${title}`;
    const embed=new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    embed.searchParams.set('start',String(Number.isFinite(start)?start:0));
    embed.searchParams.set('playsinline','1');embed.searchParams.set('autoplay','1');
    embed.searchParams.set('rel','0');embed.searchParams.set('hl','ru');
    frame.src=embed.href;
    frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
    const footer=document.createElement('div');footer.className='player-footer';
    const help=document.createElement('p');help.append('Если видео недоступно здесь: ');
    const external=document.createElement('a');external.href=source;external.textContent='Открыть в YouTube';external.target='_blank';external.rel='noopener noreferrer';help.append(external);
    const close=document.createElement('button');close.type='button';close.className='player-close';close.textContent='Скрыть видео';close.addEventListener('click',()=>closeExerciseVideo(true));
    footer.append(help,close);panel.append(frame,footer);button.after(panel);
    button.setAttribute('aria-expanded','true');activeVideo={button,panel};
    requestAnimationFrame(()=>{if(activeVideo?.panel===panel)panel.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
  });
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&activeVideo)closeExerciseVideo(true)});
