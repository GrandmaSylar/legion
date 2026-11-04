// The only thing a student may learn about fees: whether a balance is owed. The database returns a
// plain yes or no, never an amount, and a student cannot read any fee records.
import { supabase } from "../supabase";

export async function getMyFeeNotice(): Promise<boolean> {
  const { data, error } = await supabase.rpc("my_fee_notice");
  if (error) throw error;
  return data === true;
}
