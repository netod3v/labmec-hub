// Uses only content already authorized and delivered to this account.
export function activityNotifications(posts, demands, uid, people) {
  if(!uid)return [];
  const result=[];
  const personFor=id=>({uid:id,name:people[id]?.name||'Integrante',photo:people[id]?.photo||null});
  for(const post of posts){
    const visit=(comments,parent,path)=>{
      for(const [id,comment] of Object.entries(comments||{})){
        if(!comment||typeof comment!=='object')continue;
        const node=path+'/'+id;
        if(comment.uid&&comment.uid!==uid&&(parent?.uid===uid||post.uid===uid)){
          result.push({kind:parent?'post-reply':'post-comment',notificationId:`${post._sector||''}/${post.id}/${node}`,ts:Number(comment.ts)||0,post,person:personFor(comment.uid)});
        }
        visit(comment.replies,comment,node+'/replies');
      }
    };
    visit(post.comments,null,'comments');
  }
  for(const demand of demands){
    if(demand.uid!==uid&&demand.assignedTo?.[uid]&&!demand.mentions?.[uid]){
      result.push({kind:'demand-assigned',notificationId:`${demand._sector||''}/${demand.id}`,ts:Number(demand.ts)||0,item:demand,person:personFor(demand.uid)});
    }
  }
  return result;
}
