import { redirect } from "next/navigation";

/** Site root sends readers to the Korean news home. */
export default function RootPage() {
  redirect("/ko");
}
