import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { ProfileConsole } from "@/features/console/profile/ProfileConsole";

export default async function ProfilePage() {
  const result=await getConsoleBootstrap();
  return result.status==='authenticated'?<ProfileConsole mustChangePassword={result.data.user.mustChangePassword}/>:null;
}
