import { permanentRedirect } from "next/navigation";

export default function PermissionsPage() {
  permanentRedirect("/console/members");
}
