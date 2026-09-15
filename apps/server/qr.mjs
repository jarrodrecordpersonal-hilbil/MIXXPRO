/** QR Code byte mode, error correction L, versions 1–5, fixed mask 0.
 * Original implementation. Short tracking URLs only; never uses an external QR service.
 */
export function qrMatrix(value){
  const bytes=[...new TextEncoder().encode(value)],dataCounts=[19,34,55,80,108],eccCounts=[7,10,15,20,26];
  const vi=dataCounts.findIndex(n=>bytes.length<=n-2);if(vi<0)throw Error('QR URL is too long (106 UTF-8 bytes maximum). Use a shorter APP_ORIGIN.');
  const version=vi+1,size=17+4*version,dataCount=dataCounts[vi],eccCount=eccCounts[vi];
  let bits=[];const push=(n,count)=>{for(let i=count-1;i>=0;i--)bits.push((n>>>i)&1);};
  push(4,4);push(bytes.length,8);bytes.forEach(b=>push(b,8));push(0,Math.min(4,dataCount*8-bits.length));while(bits.length%8)push(0,1);
  const data=[];for(let i=0;i<bits.length;i+=8)data.push(bits.slice(i,i+8).reduce((a,b)=>(a<<1)|b,0));
  for(let pad=0;data.length<dataCount;pad++)data.push(pad%2?0x11:0xec);
  const mul=(a,b)=>{let r=0;for(let i=0;i<8;i++){if(b&1)r^=a;b>>>=1;a<<=1;if(a&256)a^=0x11d;}return r;};
  let gen=[1],root=1;for(let i=0;i<eccCount;i++){const next=Array(gen.length+1).fill(0);gen.forEach((v,j)=>{next[j]^=v;next[j+1]^=mul(v,root);});gen=next;root=mul(root,2);}
  const remainder=Array(eccCount).fill(0);for(const b of data){const factor=b^remainder.shift();remainder.push(0);for(let j=0;j<eccCount;j++)remainder[j]^=mul(gen[j+1],factor);}
  bits=[];[...data,...remainder].forEach(b=>push(b,8));
  const matrix=Array.from({length:size},()=>Array(size).fill(false)),reserved=Array.from({length:size},()=>Array(size).fill(false));
  const put=(x,y,dark)=>{if(x>=0&&y>=0&&x<size&&y<size){matrix[y][x]=!!dark;reserved[y][x]=true;}};
  for(const [cx,cy]of [[3,3],[size-4,3],[3,size-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy));put(cx+dx,cy+dy,d!==2&&d!==4);}
  for(let i=8;i<size-8;i++){put(i,6,i%2===0);put(6,i,i%2===0);}
  if(version>1){const c=size-7;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)put(c+dx,c+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}
  const format=(mask)=>{
    let n=(1<<3)|mask,r=n;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);const f=((n<<10)|r)^0x5412;const b=i=>(f>>>i)&1;
    for(let i=0;i<=5;i++)put(8,i,b(i));put(8,7,b(6));put(8,8,b(7));put(7,8,b(8));for(let i=9;i<15;i++)put(14-i,8,b(i));
    for(let i=0;i<8;i++)put(size-1-i,8,b(i));for(let i=8;i<15;i++)put(8,size-15+i,b(i));put(8,size-8,true);
  };format(0);
  let cursor=0,up=true;for(let right=size-1;right>=1;right-=2){if(right===6)right--;for(let k=0;k<size;k++){const y=up?size-1-k:k;for(let j=0;j<2;j++){const x=right-j;if(!reserved[y][x])matrix[y][x]=!!((bits[cursor++]||0)^((x+y)%2===0?1:0));}}up=!up;}
  return matrix;
}
export function qrSvg(value){const m=qrMatrix(value),s=m.length+8;let path='';m.forEach((r,y)=>r.forEach((d,x)=>{if(d)path+=`M${x+4},${y+4}h1v1h-1z`;}));return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" role="img" aria-label="Venue QR code"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;}
