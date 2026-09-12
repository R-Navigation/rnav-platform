import { permanentRedirect } from "next/navigation";

export default function UsersPage() {
  permanentRedirect("/console/members");
}
