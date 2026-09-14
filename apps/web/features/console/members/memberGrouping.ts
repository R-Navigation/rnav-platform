export type MemberGroupKey="faculty"|"postdoc"|"phd"|"master"|"undergrad"|"alumni"|"system";
export const memberGroups:Array<{key:MemberGroupKey;label:string;collapsed:boolean}>=[
  {key:"faculty",label:"老师",collapsed:false},{key:"postdoc",label:"博士后",collapsed:false},
  {key:"phd",label:"博士生",collapsed:false},{key:"master",label:"硕士生",collapsed:false},
  {key:"undergrad",label:"本科生",collapsed:false},{key:"alumni",label:"校友",collapsed:true},
  {key:"system",label:"系统",collapsed:true},
];
export function memberGroup(member:{accountKind:"person"|"system";memberStatus:string;academicStage:string}):MemberGroupKey{
  if(member.accountKind==="system")return "system";
  if(member.memberStatus==="alumni")return "alumni";
  return (["faculty","postdoc","phd","master","undergrad"].includes(member.academicStage)?member.academicStage:"undergrad") as MemberGroupKey;
}
export function groupMembers<T extends Parameters<typeof memberGroup>[0]>(members:T[]){return memberGroups.map((group)=>({...group,members:members.filter((member)=>memberGroup(member)===group.key)}));}
