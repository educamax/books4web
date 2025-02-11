const { createClient } = require('@supabase/supabase-js');

// Suas credenciais do Supabase (você precisará preencher isso)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// Inicializa o cliente do Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase }; 