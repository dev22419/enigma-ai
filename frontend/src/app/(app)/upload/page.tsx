// AI-assisted: Used Claude to write this file.
import { redirect } from "next/navigation";

/** The upload page became the chat. Old links land there. */
export default function UploadPage() {
  redirect("/chat");
}
