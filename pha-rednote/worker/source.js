import files from './source.generated.js';

const prefix='/source/';
const introduction=`PHA Rednote — toàn bộ mã nguồn phần tải video, bản 27
Commit: fb6ee076e7a7cbc1a291c5a5cbdde4b7866a281f

Luồng: link Rednote → máy chủ lấy URL bản gốc → tải vào app → Dịch & lồng tiếng.
Caption giữ nguyên bản gốc. Bản này hạ xuống 1080p khi xuất hoặc lưu;
chưa chuyển video sang 1080p trên máy chủ trước khi điện thoại tải.
Các file dưới đây giữ nguyên toàn bộ nội dung, gồm phần tích hợp trong app.
Những module phụ thuộc và tài nguyên xử lý video thuộc mã nguồn app đầy đủ.

Link từng file (cùng địa chỉ app):
`;
const fullSource=introduction+Object.keys(files).map(name=>prefix+name).join('\n')+'\n\n'+
 Object.entries(files).map(([name,code])=>'================ '+name+' ================\n\n'+code+'\n').join('\n');

export function handleSource(request){
 const path=new URL(request.url).pathname;
 if(!path.startsWith(prefix))return null;
 const headers={
  'content-type':'text/plain; charset=utf-8',
  'cache-control':'private, no-cache',
  'x-content-type-options':'nosniff',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'"
 };
 if(!['GET','HEAD'].includes(request.method))return new Response('Chỉ hỗ trợ GET hoặc HEAD.',{status:405,headers:{...headers,allow:'GET, HEAD'}});
 const name=path.slice(prefix.length);
 const content=name==='tai-video.txt'?fullSource:Object.hasOwn(files,name)?files[name]:null;
 if(content===null)return new Response(request.method==='HEAD'?null:'Không có file mã nguồn này.',{status:404,headers});
 headers['content-disposition']='inline; filename="'+name.split('/').at(-1)+'"';
 return new Response(request.method==='HEAD'?null:content,{headers});
}
