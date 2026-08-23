"use server";

import { revalidatePath } from "next/cache";
import { normalizeEditorialPriority } from "@/lib/admin/editorialPriority";
import { supabase } from "@/lib/supabase";

function revalidateEditorialPriorityPages(articleId?: string) {
  revalidatePath("/admin/review");
  revalidatePath("/admin/approved");
  revalidatePath("/admin/published");
  revalidatePath("/admin/on-hold");
  revalidatePath("/admin/revision");
  if (articleId) {
    revalidatePath(`/admin/review/${articleId}`);
  }
  revalidatePath("/");
  revalidatePath("/ko");
  revalidatePath("/en");
}

export async function setEditorialPriority(
  articleId: string,
  priorityRaw: string
) {
  const editorialPriority = normalizeEditorialPriority(priorityRaw);
  const { error } = await supabase
    .from("articles")
    .update({
      editorial_priority: editorialPriority,
      editorial_priority_manual: true,
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateEditorialPriorityPages(articleId);
}

export async function setEditorialPriorityFromForm(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "").trim();
  const priority = String(formData.get("editorialPriority") ?? "");
  if (!articleId) {
    console.error("[setEditorialPriorityFromForm] missing articleId");
    return;
  }
  await setEditorialPriority(articleId, priority);
}
