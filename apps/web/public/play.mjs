const form=document.getElementById('code-form');
const input=document.getElementById('event-code');
const error=document.getElementById('code-error');
input.addEventListener('input',()=>{input.value=input.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'');error.textContent='';});
form.addEventListener('submit',event=>{
  event.preventDefault();
  const code=input.value.trim().toUpperCase();
  if(!/^[A-Z0-9_-]{3,20}$/.test(code)){error.textContent='Enter the code shown on the screen.';input.focus();return;}
  location.assign('/games/'+encodeURIComponent(code));
});
