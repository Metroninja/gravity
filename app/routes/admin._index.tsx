import { redirect } from "react-router";

export async function loader() {
  return redirect("/admin/courses");
}

export default function AdminIndex() {
  return null;
}
