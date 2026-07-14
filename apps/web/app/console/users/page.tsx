import {getConsoleBootstrap}from"@/features/console/bootstrap";import{UserManagement}from"@/features/console/users/UserManagement";

export default async function UsersPage() {const r=await getConsoleBootstrap();return r.status==='authenticated'?<UserManagement actorId={r.data.user.id} actorTier={r.data.user.tier}/>:null;
}
