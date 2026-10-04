(() => {
  function getClient() {
    const client = window.SaathiAuth?.client;
    if (!client || !window.SaathiAuth.user) throw new Error('Please sign in first.');
    return { client, user: window.SaathiAuth.user };
  }

  async function getProfile() {
    return window.SaathiAuth?.profile || null;
  }

  async function getCatalog() {
    const client = window.SaathiAuth?.client;
    if (!client) throw new Error('Supabase is not configured.');
    const { data, error } = await client
      .from('app_catalog')
      .select('payload')
      .eq('id', 'default')
      .single();
    if (error) throw error;
    return data.payload;
  }

  async function saveCatalog(payload) {
    const { client, user } = getClient();
    const { error } = await client
      .from('app_catalog')
      .update({ payload, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', 'default');
    if (error) throw error;
  }

  async function saveProfile(profile) {
    const { client, user } = getClient();
    const { data, error } = await client
      .from('profiles')
      .update({
        name: profile.name.trim().slice(0, 80),
        language: profile.language,
        senior_mode: Boolean(profile.senior_mode)
      })
      .eq('id', user.id)
      .select('id, name, language, senior_mode, role')
      .single();
    if (error) throw error;
    return data;
  }

  async function getProgress() {
    const { client, user } = getClient();
    const { data, error } = await client
      .from('lesson_progress')
      .select('lesson_id, completed_at')
      .eq('profile_id', user.id);
    if (error) throw error;
    return { progress: data };
  }

  async function completeLesson(lessonId) {
    const { client, user } = getClient();
    const { error } = await client
      .from('lesson_progress')
      .upsert({ profile_id: user.id, lesson_id: lessonId }, { onConflict: 'profile_id,lesson_id' });
    if (error) throw error;
    return { saved: true };
  }

  window.SaathiAPI = { getProfile, saveProfile, getProgress, completeLesson, getCatalog, saveCatalog };
})();
