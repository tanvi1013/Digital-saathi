(() => {
  let client = null;
  let session = null;
  let profile = null;
  let authChangeHandler = null;

  async function loadProfile(userId) {
    if (!client || !userId) return null;
    const { data, error } = await client
      .from('profiles')
      .select('id, name, language, senior_mode, role, created_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function initialize() {
    try {
      const response = await fetch('/api/config');
      const config = await response.json();
      if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) {
        return { configured: false, user: null, profile: null };
      }

      client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      session = data.session;
      profile = await loadProfile(session?.user?.id);

      client.auth.onAuthStateChange((_event, nextSession) => {
        session = nextSession;
        setTimeout(async () => {
          try {
            profile = await loadProfile(session?.user?.id);
          } catch (_error) {
            profile = null;
          }
          authChangeHandler?.({ user: session?.user || null, profile });
        }, 0);
      });

      return { configured: true, user: session?.user || null, profile };
    } catch (error) {
      return { configured: false, user: null, profile: null, error };
    }
  }

  async function signIn(email, password) {
    if (!client) throw new Error('Supabase is not configured.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    session = data.session;
    profile = await loadProfile(data.user.id);
    return { user: data.user, profile };
  }

  async function signUp({ name, email, password, language }) {
    if (!client) throw new Error('Supabase is not configured.');
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { name, language } }
    });
    if (error) throw error;
    session = data.session;
    profile = await loadProfile(data.user?.id);
    return { user: data.user, profile, session: data.session };
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    session = null;
    profile = null;
  }

  window.SaathiAuth = {
    initialize,
    signIn,
    signUp,
    signOut,
    onChange: (handler) => { authChangeHandler = handler; },
    get client() { return client; },
    get session() { return session; },
    get user() { return session?.user || null; },
    get profile() { return profile; },
    get configured() { return Boolean(client); }
  };
})();
