import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormField } from "./forms";

/**
 * A file field's answer is the stored file. The browser sends each file
 * beside the answers, as `file_<fieldId>`; it goes into the private
 * form-uploads bucket, as the service role, once the caller has checked the
 * person may hand this form in. The answer becomes { file, name }.
 *
 * Returns the paths stored, so a later failure can take them back out.
 */
export async function storeFormFiles(
  admin: SupabaseClient,
  formData: FormData,
  fields: FormField[],
  answers: Record<string, unknown>,
  prefix: string,
): Promise<{ uploaded: string[]; error?: string }> {
  const uploaded: string[] = [];
  const fail = async (error: string) => {
    if (uploaded.length) await admin.storage.from("form-uploads").remove(uploaded);
    return { uploaded: [], error };
  };
  for (const f of fields) {
    if (f.type !== "file") continue;
    const file = formData.get(`file_${f.id}`);
    if (!(file instanceof File) || file.size === 0) {
      delete answers[f.id];
      continue;
    }
    if (file.size > 3 * 1024 * 1024) return fail(`${f.label}: keep the file under 3 MB.`);
    if (!/^(image\/|application\/pdf$)/.test(file.type)) return fail(`${f.label}: use a photo or a PDF.`);
    const path = `${prefix}/${f.id}-${crypto.randomUUID()}-${file.name.replace(/[^\w.\- ]+/g, "")}`;
    const { error } = await admin.storage
      .from("form-uploads")
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
    if (error) return fail(`${f.label}: ${error.message}`);
    uploaded.push(path);
    answers[f.id] = { file: path, name: file.name };
  }
  return { uploaded };
}

export async function discardFormFiles(admin: SupabaseClient, paths: string[]): Promise<void> {
  if (paths.length) await admin.storage.from("form-uploads").remove(paths);
}
