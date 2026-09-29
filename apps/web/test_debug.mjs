import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://bztspepijnvskcwjwjeb.supabase.co";
const anonKey = "sb_publishable_WmVF8jHtS-OYJd6OnhD6wQ_KjU63bf6";

const supabase = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false },
});

async function test(email, password) {
  console.log(`\nTesting login for: ${email}`);
  const res = await supabase.auth.signInWithPassword({ email, password });
  if (res.error) {
    console.log("Error status:", res.error.status);
    console.log("Error message:", res.error.message);
    console.log("Error code:", res.error.code);
    console.log("Full error:", JSON.stringify(res.error, null, 2));
  } else {
    console.log("Login SUCCESS! User ID:", res.data.user.id);
  }
}

async function main() {
  await test("kingsail108@gmail.com", "wrongpass");
  await test("branchadmin@gmail.com", "Branch@123456");
  await test("brandadmin@gmail.com", "Brand@123456");
  await test("admin@restaurant.com", "Admin@123456");
}

main().catch(console.error);
