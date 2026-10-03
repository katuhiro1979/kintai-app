// クラウド同期(Supabase)の通信部分。画面や同期の判断は app.jsx 側で行う。
// supabase-js を読み込めない場合(オフライン等)は enabled=false となり、アプリは従来どおり端末内のみで動く。
(function () {
  const cfg = window.KINTAI_CLOUD_CONFIG || {};
  const APP_NAME = "出勤簿";
  const KEY = "kintai-data-v1";
  const TABLE = "app_kv";

  let sb = null;
  try {
    if (window.supabase && cfg.url && cfg.key && !String(cfg.url).startsWith("YOUR_")) {
      sb = window.supabase.createClient(cfg.url, cfg.key);
    }
  } catch (e) {
    sb = null;
  }

  const api = {
    enabled: !!sb,

    async getUserEmail() {
      if (!sb) return null;
      const { data } = await sb.auth.getSession();
      return data && data.session ? data.session.user.email : null;
    },
    // ログイン状態の変化を監視する。戻り値の関数を呼ぶと監視を止める。
    onChange(cb) {
      if (!sb) return () => {};
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session ? session.user.email : null));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      return sb.auth.signInWithPassword({ email, password });
    },
    async signUp(email, password) {
      return sb.auth.signUp({ email, password });
    },
    async signOut() {
      return sb.auth.signOut();
    },

    // クラウド上のデータを取得する。{ data: {value, updated_at} | null, error }
    async pull() {
      return sb.from(TABLE).select("value, updated_at").eq("app_name", APP_NAME).eq("key", KEY).maybeSingle();
    },
    // クラウドへ保存する。expectedAt が指定されたら、その時刻から変わっていない場合のみ上書きする。
    // 他の端末が先に更新していた場合は { conflict: true } を返す(データは上書きしない)。
    async push(value, expectedAt) {
      if (expectedAt) {
        const { data, error } = await sb.from(TABLE).update({ value })
          .eq("app_name", APP_NAME).eq("key", KEY).eq("updated_at", expectedAt)
          .select("updated_at");
        if (error) return { error };
        if (!data || !data.length) return { conflict: true };
        return { updatedAt: data[0].updated_at };
      }
      const { data, error } = await sb.from(TABLE).insert({ app_name: APP_NAME, key: KEY, value }).select("updated_at");
      if (error) return error.code === "23505" ? { conflict: true } : { error };
      return { updatedAt: data[0].updated_at };
    },
  };

  window.kintaiCloud = api;
})();
