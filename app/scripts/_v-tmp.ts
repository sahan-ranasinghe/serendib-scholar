import { supabaseAdmin } from "../src/lib/supabaseAdmin";
async function main(){
  const { error } = await supabaseAdmin.from("children").update({ gender: "boy" }).eq("id", process.env.DEV_CHILD_ID!);
  if (error) { console.log("NOT YET:", error.message); process.exit(2); }
  const { data } = await supabaseAdmin.from("children").select("id, display_name, gender").eq("id", process.env.DEV_CHILD_ID!).single();
  console.log("dev child:", JSON.stringify(data));
}
main();
