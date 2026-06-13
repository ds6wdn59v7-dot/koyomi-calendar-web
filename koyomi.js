/* koyomi.js — 和暦データ計算エンジン（任意の日付対応）
   旧暦・節気・月齢は略算天文計算（Meeus主要項）。Swift版 AstroCalc/Koyomi の移植。 */

const Astro = {
  SYNODIC: 29.530588853,
  norm360: (x) => ((x % 360) + 360) % 360,
  norm180(x) { const v = this.norm360(x); return v > 180 ? v - 360 : v; },

  jdn(y, m, d) {
    const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
      - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  },
  jd(jdn, hourJST) { return jdn - 0.5 + (hourJST - 9) / 24; },
  jstDateNum(jd) { return Math.floor(jd + 9 / 24 + 0.5); },
  T(jd) { return (jd + 70 / 86400 - 2451545) / 36525; },

  sunLong(jd) {
    const t = this.T(jd), k = Math.PI / 180;
    const L0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
    const M = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) * k;
    const C = (1.914602 - 0.004817 * t) * Math.sin(M)
      + (0.019993 - 0.000101 * t) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
    return this.norm360(L0 + C - 0.00569);
  },

  moonLong(jd) {
    const t = this.T(jd), k = Math.PI / 180;
    const Lp = 218.3164477 + 481267.88123421 * t - 0.0015786 * t * t;
    const D = (297.8501921 + 445267.1114034 * t - 0.0018819 * t * t) * k;
    const M = (357.5291092 + 35999.0502909 * t - 0.0001536 * t * t) * k;
    const Mp = (134.9633964 + 477198.8675055 * t + 0.0087414 * t * t) * k;
    const F = (93.2720950 + 483202.0175233 * t - 0.0036539 * t * t) * k;
    const E = 1 - 0.002516 * t;
    const s = Math.sin, terms =
      6.288774 * s(Mp) + 1.274027 * s(2 * D - Mp) + 0.658314 * s(2 * D)
      + 0.213618 * s(2 * Mp) - 0.185116 * E * s(M) - 0.114332 * s(2 * F)
      + 0.058793 * s(2 * D - 2 * Mp) + 0.057066 * E * s(2 * D - M - Mp)
      + 0.053322 * s(2 * D + Mp) + 0.045758 * E * s(2 * D - M)
      - 0.040923 * E * s(M - Mp) - 0.034720 * s(D) - 0.030383 * E * s(M + Mp)
      + 0.015327 * s(2 * D - 2 * F) - 0.012528 * s(Mp + 2 * F) + 0.010980 * s(Mp - 2 * F)
      + 0.010675 * s(4 * D - Mp) + 0.010034 * s(3 * Mp) + 0.008548 * s(4 * D - 2 * Mp)
      - 0.007888 * E * s(2 * D + M - Mp) - 0.006766 * E * s(2 * D + M) - 0.005163 * s(D - Mp)
      + 0.004987 * E * s(D + M) + 0.004036 * E * s(2 * D - M + Mp) + 0.003994 * s(2 * D + 2 * Mp)
      + 0.003861 * s(4 * D) + 0.003665 * s(2 * D - 3 * Mp);
    return this.norm360(Lp + terms);
  },

  _convNM(jd) {
    let t = jd;
    for (let i = 0; i < 12; i++) {
      const e = this.norm180(this.moonLong(t) - this.sunLong(t));
      if (Math.abs(e) < 1e-7) break;
      t -= e / 12.1908;
    }
    return t;
  },
  newMoonBefore(jd) {
    let t = this._convNM(jd);
    if (t > jd) t = this._convNM(t - this.SYNODIC);
    return t;
  },
  newMoonAfter(jd) {
    let t = this._convNM(jd);
    if (t <= jd) t = this._convNM(t + this.SYNODIC);
    return t;
  },
  solarTermTime(target, near) {
    let t = near;
    for (let i = 0; i < 12; i++) {
      const e = this.norm180(this.sunLong(t) - target);
      if (Math.abs(e) < 1e-7) break;
      t -= e / 0.9856;
    }
    return t;
  },

  lunarDate(dn) {
    const jdEnd = this.jd(dn, 24);
    const saku = this.newMoonBefore(jdEnd);
    const day = dn - this.jstDateNum(saku) + 1;
    const nextSakuDn = this.jstDateNum(this.newMoonAfter(saku + 1));
    const lam = this.sunLong(saku);
    const nextTarget = this.norm360((Math.floor(lam / 30) + 1) * 30);
    const guess = saku + this.norm360(nextTarget - lam) / 0.9856;
    const chukiDn = this.jstDateNum(this.solarTermTime(nextTarget, guess));
    if (chukiDn < nextSakuDn) {
      let m = (Math.round(nextTarget / 30) + 2) % 12; if (m === 0) m = 12;
      return { m, d: day, leap: false };
    }
    const prevTarget = this.norm360(Math.floor(lam / 30) * 30);
    let m = (Math.round(prevTarget / 30) + 2) % 12; if (m === 0) m = 12;
    return { m, d: day, leap: true };
  },

  moonAge(dn) {
    const noon = this.jd(dn, 12);
    return noon - this.newMoonBefore(noon);
  },

  solsticeDateNum(year, summer) {
    const guess = this.jd(this.jdn(year, summer ? 6 : 12, 21), 12);
    return this.jstDateNum(this.solarTermTime(summer ? 90 : 270, guess));
  },
};

const Koyomi = (() => {
  const memo = { lunar: new Map(), holidays: new Map(), events: new Map() };

  const KAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  const SHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const KAN_YOMI = ["きのえ", "きのと", "ひのえ", "ひのと", "つちのえ", "つちのと", "かのえ", "かのと", "みずのえ", "みずのと"];
  const SHI_YOMI = ["ね", "うし", "とら", "う", "たつ", "み", "うま", "ひつじ", "さる", "とり", "いぬ", "い"];
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const WAFU = ["", "睦月", "如月", "弥生", "卯月", "皐月", "水無月", "文月", "葉月", "長月", "神無月", "霜月", "師走"];

  const ROKUYO = ["大安", "赤口", "先勝", "友引", "先負", "仏滅"];
  const ROKUYO_YOMI = { 大安: "たいあん", 赤口: "しゃっこう", 先勝: "せんしょう", 友引: "ともびき", 先負: "せんぶ", 仏滅: "ぶつめつ" };
  const ROKUYO_NOTE = {
    大安: "「大いに安し」の意で、六曜中もっとも吉とされる日。終日万事に障りがなく、婚礼・建築・開業・移転・旅行など祝い事や事始めに最適とされる。",
    赤口: "「しゃっこう」。陰陽道の凶神・赤舌神が支配する日で、終日凶。ただし正午（午の刻）前後のみ吉とされる。火の元・刃物・死に関わる事に注意。祝い事は避ける。",
    先勝: "「先んずれば即ち勝つ」。万事に急ぐが吉とされ、午前中は吉・午後二時頃からは凶。訴訟や急ぎの用事を早めに済ませると良い日。",
    友引: "「友を引く」。朝夕は吉、正午前後のみ凶。慶事は喜びを友に分かつとして好まれるが、葬儀は「友を引く」を忌んで避ける慣わし。火葬場の多くが休業する。",
    先負: "「先んずれば即ち負ける」。先勝の逆で、午前は凶・午後は吉。急がず控えめに、平静を保って過ごすのが良いとされる日。勝負事や急用は避ける。",
    仏滅: "「仏も滅するほどの凶日」の意で、六曜中もっとも凶。婚礼や開店など祝い事は避けるのが通例。一方で「物事が滅して新たに始まる」と捉え、再出発に良いとする説もある。",
  };

  const CHOKU = ["建", "除", "満", "平", "定", "執", "破", "危", "成", "納", "開", "閉"];
  const CHOKU_YOMI = ["たつ", "のぞく", "みつ", "たいら", "さだん", "とる", "やぶる", "あやぶ", "なる", "おさん", "ひらく", "とづ"];
  const CHOKU_NOTE = {
    建: "「たつ」。万物を建て生ずる、十二直の筆頭にあたる大吉日。神事・婚礼・開店・移転・棟上げに吉。ただし蔵開きや土を動かす事、訴訟は避ける。",
    除: "「のぞく」。障り・不浄を取り除く日。井戸掘り・治療・種蒔き・掃除・厄払いに吉。婚礼や動土（土木）は控える。",
    満: "「みつ」。万物が満ち足りる吉日。新規事・移転・建築・婚礼・開店に吉。一方で服薬や動土は忌むとされる。",
    平: "「たいら」。物事が平らかに調う日。旅行・婚礼・道路や地面をならす作業に吉。穴掘りや種蒔きは避ける。",
    定: "「さだん」。善悪が定まる日。開店・婚礼・移転・種蒔きに吉。半面、定まりすぎて変化を嫌うため、訴訟や旅行は凶とされる。",
    執: "「とる」。物事を執り行う日。祭祀・造作・婚礼・種蒔きに吉。金銭の出し入れや財産にかかわる事は凶。",
    破: "「やぶる」。突き破る勢いの日。訴訟・談判・出陣・漁猟に吉。一方で婚礼・契約など和合を要する祝い事は破れるとして凶。",
    危: "「あやぶ」。物事が危うい日。万事に控えめにし、登山・船旅・高所の作業は特に慎む。気を引き締めて過ごす。",
    成: "「なる」。物事が成就する吉日。開店・建築・種蒔き・新規事の開始に吉。訴訟や談判など争い事は成らぬとして凶。",
    納: "「おさん」。物を納め入れる日。収穫・買い物・取引・銭谷の収納に吉。婚礼や見合いなど人を迎える事は避ける。",
    開: "「ひらく」。開き通じる吉日。建築・移転・開店・婚礼に吉。ただし不浄を忌み、葬儀や穴を掘る事は凶とされる。",
    閉: "「とづ」。閉じ籠る日。金銭の収納・池や穴の埋め立て・墓造りに吉。開店や棟上げ、婚礼など「開く」事には凶。",
  };

  const SHUKU = ["角", "亢", "氐", "房", "心", "尾", "箕", "斗", "牛", "女", "虚", "危", "室", "壁", "奎", "婁", "胃", "昴", "畢", "觜", "参", "井", "鬼", "柳", "星", "張", "翼", "軫"];
  const SHUKU_YOMI = ["すぼし", "あみぼし", "ともぼし", "そいぼし", "なかごぼし", "あしたれぼし", "みぼし", "ひきつぼし", "いなみぼし", "うるきぼし", "とみてぼし", "うみやめぼし", "はついぼし", "なまめぼし", "とかきぼし", "たたらぼし", "えきえぼし", "すばるぼし", "あめふりぼし", "とろきぼし", "からすきぼし", "ちちりぼし", "たまをのぼし", "ぬりこぼし", "ほとほりぼし", "ちりこぼし", "たすきぼし", "みつかけぼし"];
  const SHUKU_NOTE = {
    角: "吉。衣類の裁断・柱立て・結婚に吉", 亢: "凶。種蒔き・移転に吉、衣類仕立ては凶",
    氐: "吉。婚礼・酒造り・開店に吉", 房: "吉。婚礼・旅行・移転・棟上げに大吉",
    心: "凶。神仏祭祀・移転に吉、その他は控える", 尾: "吉。婚礼・移転・造作・開業に吉",
    箕: "吉。動土・建築・集金・仕入れに吉", 斗: "吉。土掘り・倉庫造り・新規事に吉",
    牛: "吉。全てに吉、特に婚礼・建築に大吉", 女: "凶。学問・芸事のみ吉、訴訟・婚礼は凶",
    虚: "凶。学問始めのみ吉、その他は控える", 危: "凶。壁塗り・酒造りに吉、登山・船は凶",
    室: "吉。祈願・婚礼・祝い事・造作に吉", 壁: "吉。新規事・旅行・婚礼・開店に吉",
    奎: "吉。文書・旅行に吉、柱立て・棟上げは凶", 婁: "吉。造作・契約・取引・婚礼に吉",
    胃: "吉。公事・就職・開業に吉、婚礼に吉", 昴: "吉。神事・祝い事・開店に吉",
    畢: "吉。神事・造作・取引・婚礼に大吉", 觜: "凶。稽古始めのみ吉、その他は控える",
    参: "吉。仕入れ・建築・祝い事に吉、婚礼は凶", 井: "吉。神事・種蒔き・建築に吉、裁縫は凶",
    鬼: "大吉。婚礼以外は万事に大吉の日", 柳: "凶。物事を断つのに吉、婚礼・開店は凶",
    星: "凶。乗馬・治療に吉、婚礼・葬儀は凶", 張: "吉。就職・見合い・祝い事・開店に大吉",
    翼: "凶。耕作・種蒔きのみ吉、婚礼・入居は凶", 軫: "吉。地鎮祭・落成・買い物に吉、衣裁ちは凶",
  };

  const KYUSEI = [null,
    { n: "一白水星", s: "一白", y: "いっぱくすいせい", note: "水・北の星。困難からの再起と適応を司る。沈着冷静で社交的。" },
    { n: "二黒土星", s: "二黒", y: "じこくどせい", note: "土・西南の星。母なる大地。勤勉・忍耐・補佐の徳を司る。" },
    { n: "三碧木星", s: "三碧", y: "さんぺきもくせい", note: "木・東の星。雷の象。発展・行動・若さと進取を司る。" },
    { n: "四緑木星", s: "四緑", y: "しろくもくせい", note: "木・東南の星。風の象。信用・縁・調う事を司る。" },
    { n: "五黄土星", s: "五黄", y: "ごおうどせい", note: "土・中央の星。帝王の象。強大な力を持ち吉凶が両極に振れる。" },
    { n: "六白金星", s: "六白", y: "ろっぱくきんせい", note: "金・西北の星。天の象。完璧・権威・勝負ごとを司る。" },
    { n: "七赤金星", s: "七赤", y: "しちせききんせい", note: "金・西の星。沢の象。金銭・社交・悦びと実りを司る。" },
    { n: "八白土星", s: "八白", y: "はっぱくどせい", note: "土・東北の星。山の象。変化・相続・蓄積と転機を司る。" },
    { n: "九紫火星", s: "九紫", y: "きゅうしかせい", note: "火・南の星。火の象。名誉・知性・華やかさと別離を司る。" }];

  const SEKKI_LIST = [
    ["立春", "りっしゅん", "春の気立つ、暦の上での春の始まり"], ["雨水", "うすい", "雪が雨に変わり、氷が解け始める頃"],
    ["啓蟄", "けいちつ", "冬ごもりの虫が地上に這い出てくる頃"], ["春分", "しゅんぶん", "昼夜の長さがほぼ等しくなる日"],
    ["清明", "せいめい", "万物が清らかで生き生きとする頃"], ["穀雨", "こくう", "穀物を潤す春の雨が降る頃"],
    ["立夏", "りっか", "夏の気立つ、暦の上での夏の始まり"], ["小満", "しょうまん", "万物が次第に満ち、草木が茂る頃"],
    ["芒種", "ぼうしゅ", "芒（のぎ）ある穀物の種を播く頃"], ["夏至", "げし", "一年で最も昼が長くなる日"],
    ["小暑", "しょうしょ", "梅雨が明け、暑さが本格化する頃"], ["大暑", "たいしょ", "一年で最も暑さが厳しい頃"],
    ["立秋", "りっしゅう", "秋の気立つ、暦の上での秋の始まり"], ["処暑", "しょしょ", "暑さが峠を越えて和らぐ頃"],
    ["白露", "はくろ", "草花に朝露が宿り始める頃"], ["秋分", "しゅうぶん", "昼夜の長さがほぼ等しくなる日"],
    ["寒露", "かんろ", "草木に冷たい露が降りる頃"], ["霜降", "そうこう", "霜が降り始める頃"],
    ["立冬", "りっとう", "冬の気立つ、暦の上での冬の始まり"], ["小雪", "しょうせつ", "わずかに雪が降り始める頃"],
    ["大雪", "たいせつ", "本格的に雪が降り積もる頃"], ["冬至", "とうじ", "一年で最も昼が短くなる日"],
    ["小寒", "しょうかん", "寒の入り、寒さが厳しくなる頃"], ["大寒", "だいかん", "一年で最も寒さが厳しい頃"]];

  const KOU_LIST = [
    ["東風解凍", "はるかぜこおりをとく", "春風が川や湖の氷を解かし始める"], ["黄鶯睍睆", "うぐいすなく", "鶯が山里で鳴き始める"], ["魚上氷", "うおこおりをいずる", "割れた氷の間から魚が飛び出る"],
    ["土脉潤起", "つちのしょううるおいおこる", "雨が降って土が湿り気を含む"], ["霞始靆", "かすみはじめてたなびく", "霞がたなびき始める"], ["草木萌動", "そうもくめばえいずる", "草木が芽吹き始める"],
    ["蟄虫啓戸", "すごもりむしとをひらく", "冬ごもりの虫が出てくる"], ["桃始笑", "ももはじめてさく", "桃の花が咲き始める"], ["菜虫化蝶", "なむしちょうとなる", "青虫が羽化して蝶になる"],
    ["雀始巣", "すずめはじめてすくう", "雀が巣を構え始める"], ["桜始開", "さくらはじめてひらく", "桜の花が咲き始める"], ["雷乃発声", "かみなりすなわちこえをはっす", "遠くで雷の音がし始める"],
    ["玄鳥至", "つばめきたる", "燕が南からやって来る"], ["鴻雁北", "こうがんかえる", "雁が北へ渡って行く"], ["虹始見", "にじはじめてあらわる", "雨の後に虹が出始める"],
    ["葭始生", "あしはじめてしょうず", "葦が芽を吹き始める"], ["霜止出苗", "しもやんでなえいずる", "霜が終わり稲の苗が生長する"], ["牡丹華", "ぼたんはなさく", "牡丹の花が咲く"],
    ["蛙始鳴", "かわずはじめてなく", "蛙が鳴き始める"], ["蚯蚓出", "みみずいずる", "蚯蚓が地上に這い出る"], ["竹笋生", "たけのこしょうず", "筍が生えてくる"],
    ["蚕起食桑", "かいこおきてくわをはむ", "蚕が桑を盛んに食べ始める"], ["紅花栄", "べにばなさかう", "紅花が盛んに咲く"], ["麦秋至", "むぎのときいたる", "麦が熟し収穫を迎える"],
    ["蟷螂生", "かまきりしょうず", "螳螂が生まれ出る"], ["腐草為螢", "くされたるくさほたるとなる", "蛍が舞い始める"], ["梅子黄", "うめのみきばむ", "梅の実が黄ばんで熟す"],
    ["乃東枯", "なつかれくさかるる", "夏枯草が枯れる"], ["菖蒲華", "あやめはなさく", "あやめの花が咲く"], ["半夏生", "はんげしょうず", "烏柄杓が生える"],
    ["温風至", "あつかぜいたる", "暖かい風が吹いて来る"], ["蓮始開", "はすはじめてひらく", "蓮の花が開き始める"], ["鷹乃学習", "たかすなわちわざをならう", "鷹の幼鳥が飛ぶことを覚える"],
    ["桐始結花", "きりはじめてはなをむすぶ", "桐の実が生り始める"], ["土潤溽暑", "つちうるおうてむしあつし", "土が湿って蒸し暑くなる"], ["大雨時行", "たいうときどきふる", "時として大雨が降る"],
    ["涼風至", "すずかぜいたる", "涼しい風が立ち始める"], ["寒蝉鳴", "ひぐらしなく", "蜩が鳴き始める"], ["蒙霧升降", "ふかききりまとう", "深い霧が立ち込める"],
    ["綿柎開", "わたのはなしべひらく", "綿を包む萼が開く"], ["天地始粛", "てんちはじめてさむし", "ようやく暑さが鎮まる"], ["禾乃登", "こくものすなわちみのる", "稲が実る"],
    ["草露白", "くさのつゆしろし", "草に降りた露が白く光る"], ["鶺鴒鳴", "せきれいなく", "鶺鴒が鳴き始める"], ["玄鳥去", "つばめさる", "燕が南へ帰って行く"],
    ["雷乃収声", "かみなりすなわちこえをおさむ", "雷が鳴り響かなくなる"], ["蟄虫坏戸", "むしかくれてとをふさぐ", "虫が土中に掘った穴をふさぐ"], ["水始涸", "みずはじめてかる", "田畑の水を干し始める"],
    ["鴻雁来", "こうがんきたる", "雁が北から渡って来る"], ["菊花開", "きくのはなひらく", "菊の花が咲く"], ["蟋蟀在戸", "きりぎりすとにあり", "蟋蟀が戸の辺りで鳴く"],
    ["霜始降", "しもはじめてふる", "霜が降り始める"], ["霎時施", "こさめときどきふる", "小雨がしとしと降る"], ["楓蔦黄", "もみじつたきばむ", "紅葉や蔦が黄葉する"],
    ["山茶始開", "つばきはじめてひらく", "山茶花が咲き始める"], ["地始凍", "ちはじめてこおる", "大地が凍り始める"], ["金盞香", "きんせんかさく", "水仙の花が咲く"],
    ["虹蔵不見", "にじかくれてみえず", "虹を見かけなくなる"], ["朔風払葉", "きたかぜこのはをはらう", "北風が木の葉を払い除ける"], ["橘始黄", "たちばなはじめてきばむ", "橘の実が黄色くなり始める"],
    ["閉塞成冬", "そらさむくふゆとなる", "天地の気が塞がって冬となる"], ["熊蟄穴", "くまあなにこもる", "熊が冬眠のために穴に隠れる"], ["鱖魚群", "さけのうおむらがる", "鮭が群がり川を上る"],
    ["乃東生", "なつかれくさしょうず", "夏枯草が芽を出す"], ["麋角解", "さわしかのつのおつる", "大鹿が角を落とす"], ["雪下出麦", "ゆきわたりてむぎいずる", "雪の下で麦が芽を出す"],
    ["芹乃栄", "せりすなわちさかう", "芹がよく生育する"], ["水泉動", "しみずあたたかをふくむ", "地中で凍った泉が動き始める"], ["雉始雊", "きじはじめてなく", "雄の雉が鳴き始める"],
    ["款冬華", "ふきのはなさく", "蕗の薹が蕾を出す"], ["水沢腹堅", "さわみずこおりつめる", "沢に氷が厚く張りつめる"], ["鶏始乳", "にわとりはじめてとやにつく", "鶏が卵を産み始める"]];

  // 選日・暦注下段テーブル（節月1-12 / 支index 子0..亥11）
  const ICHI = { 1: [1, 6], 2: [2, 9], 3: [0, 3], 4: [3, 4], 5: [5, 6], 6: [6, 9], 7: [7, 0], 8: [8, 1], 9: [9, 2], 10: [10, 11], 11: [11, 8], 12: [4, 7] };
  const JUSHI = { 1: 10, 2: 4, 3: 11, 4: 5, 5: 0, 6: 6, 7: 1, 8: 7, 9: 2, 10: 8, 11: 3, 12: 9 };
  const JUSSHI = { 1: 9, 2: 5, 3: 1, 4: 9, 5: 5, 6: 1, 7: 9, 8: 5, 9: 1, 10: 9, 11: 5, 12: 1 };
  const KIKO = { 1: 1, 2: 2, 3: 0, 4: 1, 5: 2, 6: 0, 7: 1, 8: 2, 9: 0, 10: 1, 11: 2, 12: 0 };
  const CHIIMI = { 1: 1, 2: 7, 3: 2, 4: 8, 5: 3, 6: 9, 7: 4, 8: 10, 9: 5, 10: 11, 11: 6, 12: 0 };
  const JIKA = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11, 8: 0, 9: 1, 10: 2, 11: 3, 12: 4 };
  const TENKA = { 1: 0, 2: 3, 3: 6, 4: 9, 5: 0, 6: 3, 7: 6, 8: 9, 9: 0, 10: 3, 11: 6, 12: 9 };
  const TAIKA = { 1: 11, 2: 6, 3: 1, 4: 8, 5: 3, 6: 10, 7: 5, 8: 0, 9: 7, 10: 2, 11: 9, 12: 4 };
  const ROJAKU = TENKA;
  const METSU = { 1: 5, 2: 0, 3: 7, 4: 2, 5: 9, 6: 4, 7: 11, 8: 6, 9: 1, 10: 8, 11: 3, 12: 10 };
  const TOKUTOKU = { 1: 2, 2: 0, 3: 8, 4: 6, 5: 2, 6: 0, 7: 8, 8: 6, 9: 2, 10: 0, 11: 8, 12: 6 };
  const FUKU = { 1: [0, 6], 2: [1, 7], 3: [4, 5], 4: [2, 8], 5: [3, 9], 6: [4, 5], 7: [0, 6], 8: [1, 7], 9: [4, 5], 10: [2, 8], 11: [3, 9], 12: [4, 5] };
  const FUJOJU = { 1: 3, 2: 5, 3: 1, 4: 4, 5: 2, 6: 6, 7: 3, 8: 5, 9: 1, 10: 4, 11: 2, 12: 6 };
  const OMO = { 1: 7, 2: 14, 3: 21, 4: 8, 5: 16, 6: 24, 7: 9, 8: 18, 9: 27, 10: 10, 11: 20, 12: 30 };
  const KUE = {
    1: [27, 50], 2: [15, 51, 57], 3: [0, 1, 2, 3, 4, 8, 16, 20, 32, 40, 44, 56],
    4: [4, 7, 19, 31, 35, 42, 43, 54, 55, 59], 5: [42, 54], 6: [5, 42, 43, 53, 55],
    7: [21, 40, 56], 8: [45, 51, 57], 9: [10, 27, 28, 29, 30, 31, 32, 33, 34, 46, 50],
    10: [1, 5, 13, 24, 25, 34, 35, 37, 48, 49, 53, 59], 11: [24, 42, 48], 12: [24, 43, 48, 59],
  };
  const KAMIYOSHI = [0, 1, 3, 5, 6, 8, 9, 13, 15, 17, 18, 21, 24, 27, 29, 32, 33, 35, 37, 39, 41, 42, 43, 44, 45, 47, 48, 51, 54, 56, 57, 59];
  const DAIMYO = [5, 6, 7, 8, 9, 13, 15, 18, 23, 28, 30, 31, 38, 40, 41, 42, 43, 45, 46, 47, 52, 54, 55, 56, 57];

  const YEAR_EVENTS = {
    "1-1": "元日", "1-2": "初夢", "1-7": "七草", "1-11": "鏡開き", "1-15": "小正月", "1-20": "二十日正月",
    "2-14": "バレンタインデー",
    "3-3": "ひな祭り", "3-14": "ホワイトデー", "3-21": "弘法大師の日",
    "4-1": "エイプリルフール", "4-8": "花まつり",
    "5-1": "メーデー", "5-5": "端午の節句",
    "6-1": "衣替え", "6-4": "歯と口の健康週間", "6-5": "環境の日", "6-10": "時の記念日", "6-16": "和菓子の日", "6-30": "夏越の祓",
    "7-1": "山開き・海開き", "7-7": "七夕",
    "8-6": "広島原爆の日", "8-13": "盆迎え火", "8-15": "終戦記念日", "8-16": "送り火",
    "9-1": "防災の日", "9-9": "重陽の節句",
    "10-1": "衣替え", "10-31": "ハロウィン",
    "11-15": "七五三",
    "12-13": "正月事始め", "12-25": "クリスマス", "12-31": "大晦日",
  };

  const REGIONS = [
    { id: "kushiro", name: "釧路", bay: "太平洋", off: -62, amp: 0.72, base: 78, lat: 42.99, lng: 144.37 },
    { id: "sendai", name: "仙台", bay: "仙台湾", off: -34, amp: 0.82, base: 75, lat: 38.27, lng: 141.03 },
    { id: "niigata", name: "新潟", bay: "日本海", off: 65, amp: 0.22, base: 28, lat: 37.95, lng: 139.06 },
    { id: "tokyo", name: "東京", bay: "東京湾", off: 0, amp: 1.0, base: 105, lat: 35.62, lng: 139.78 },
    { id: "yokohama", name: "横浜", bay: "東京湾", off: 6, amp: 1.02, base: 108, lat: 35.45, lng: 139.65 },
    { id: "nagoya", name: "名古屋", bay: "伊勢湾", off: 28, amp: 1.12, base: 130, lat: 35.09, lng: 136.88 },
    { id: "shizuoka", name: "静岡", bay: "駿河湾", off: 8, amp: 0.95, base: 100, lat: 34.97, lng: 138.39 },
    { id: "osaka", name: "大阪", bay: "大阪湾", off: 42, amp: 1.05, base: 95, lat: 34.65, lng: 135.43 },
    { id: "hiroshima", name: "広島", bay: "瀬戸内海", off: -55, amp: 1.55, base: 190, lat: 34.36, lng: 132.46 },
    { id: "fukuoka", name: "福岡", bay: "博多湾", off: 95, amp: 1.18, base: 115, lat: 33.62, lng: 130.40 },
    { id: "kochi", name: "高知", bay: "土佐湾", off: 18, amp: 1.0, base: 98, lat: 33.50, lng: 133.57 },
    { id: "nagasaki", name: "長崎", bay: "長崎港", off: 108, amp: 1.62, base: 175, lat: 32.74, lng: 129.87 },
    { id: "kagoshima", name: "鹿児島", bay: "鹿児島湾", off: 118, amp: 1.28, base: 130, lat: 31.59, lng: 130.56 },
    { id: "naha", name: "那覇", bay: "東シナ海", off: 140, amp: 0.9, base: 100, lat: 26.22, lng: 127.68 },
  ];

  const CAT = {
    rokuyo: { label: "六曜", desc: "先勝→友引→先負→仏滅→大安→赤口の順に巡り、旧暦の月初で改まる、日の吉凶を表す最も身近な暦注。中国由来の「六壬時課」が起源とされ、日本では幕末から明治にかけて広まった。冠婚葬祭の日取りの目安として今も根強く使われる。" },
    choku: { label: "十二直（中段）", desc: "北斗七星の柄が指す方角をもとに、建・除・満・平・定・執・破・危・成・納・開・閉の十二を日に配したもの。かつては暦の中段に記されたため「中段」とも呼ばれ、江戸時代までは六曜より重んじられた。普請・移転・婚礼など事柄ごとに吉凶を見る。" },
    shuku: { label: "二十八宿", desc: "天の赤道帯を二十八に分けた星座（宿）で、インド・中国を経て伝わった。月が一日に約一宿ずつ運行するとされ、日々の宿によって祝い事・建築・旅立ちなどの吉凶を占う。七曜と組み合わせて運勢を見る用い方もある。" },
    kyusei: { label: "九星（日家九星）", desc: "一白水星から九紫火星までの九つの星を、五行・方位と結びつけて日に配したもの。冬至に近い甲子の日から順に進む「陽遁」、夏至に近い甲子の日から逆に進む「陰遁」で循環する。方位の吉凶（方位除け）や運勢判断の基礎となる。" },
    eto: { label: "干支（日の干支）", desc: "十干（甲乙丙丁…）と十二支（子丑寅…）を組み合わせた六十日周期で、甲子から癸亥まで巡る。日の性質を表し、選日や暦注下段の多くがこの干支を基準に定まる。年・月・日・刻すべてに干支があり、暦の根幹をなす。" },
    lunar: { label: "旧暦（太陰太陽暦）", desc: "月の満ち欠けを基準に、太陽の動き（二十四節気）で季節のずれを補正した太陰太陽暦。新月の日を一日（朔）とし、十五日前後が満月（望）。明治5年まで使われた正式な暦で、潮の干満や年中行事・農事の目安となる。" },
    sekki: { label: "二十四節気・七十二候", desc: "太陽が黄道上を進む位置で一年を二十四に等分した季節の区切り。立春・夏至・秋分などがこれにあたる。さらに各節気を約五日ずつ三つに分けたものが七十二候で、動植物や気象の移ろいを短い言葉で表す。" },
    moon: { label: "月相・月齢", desc: "月の満ち欠けの姿（相）と、新月からの経過日数（齢）。朔（月齢0）から上弦・望（満月・約15）・下弦を経て、約29.5日で一巡する。旧暦の日付や潮の大小と密接に結びつき、夜空を読む手がかりとなる。" },
    tide: { label: "潮汐・潮回り", desc: "月と太陽の引力で海面が上下する現象。新月・満月の頃は干満差が大きい大潮、半月の頃は小さい小潮となり、大潮→中潮→小潮→長潮→若潮と巡る。漁や潮干狩り、釣りの目安として古くから重視されてきた。※本アプリの潮汐・日の出入りは簡易計算による目安です。" },
    senjitsu: { label: "選日・暦注下段", desc: "干支や節月の組み合わせで定まる、日々のこまかな吉凶注。天赦日・一粒万倍日などの吉日（七箇の善日や選日）と、受死日・三隣亡・三箇の悪日などの凶日（暦注下段）がある。事始めや慎むべき事柄の目安とされる。" },
  };

  const key = (y, m, d) => `${y}-${m}-${d}`;
  const jdn = (dt) => Astro.jdn(dt.y, dt.m, dt.d);

  function lunar(dt) {
    const k = key(dt.y, dt.m, dt.d);
    if (!memo.lunar.has(k)) memo.lunar.set(k, Astro.lunarDate(jdn(dt)));
    return memo.lunar.get(k);
  }

  const etoIndexJdn = (dn) => ((dn + 49) % 60 + 60) % 60;
  const etoIndex = (dt) => etoIndexJdn(jdn(dt));
  const branchIndex = (dt) => etoIndex(dt) % 12;
  const stemIndex = (dt) => etoIndex(dt) % 10;
  const weekday = (dt) => ((jdn(dt) + 1) % 7 + 7) % 7;

  function eto(dt) {
    const i = etoIndex(dt), k = i % 10, s = i % 12;
    return { kanji: KAN[k] + SHI[s], yomi: KAN_YOMI[k] + SHI_YOMI[s], animal: SHI[s], no: i + 1 };
  }

  const rokuyo = (dt) => { const l = lunar(dt); return ROKUYO[(l.m + l.d) % 6]; };

  function setsuNo(dt) {
    const lam = Astro.sunLong(Astro.jd(jdn(dt), 24));
    return ((Math.floor(lam / 30) - 10) % 12 + 12) % 12 + 1;
  }
  const buildBranch = (dt) => (setsuNo(dt) + 1) % 12;

  function setsuStartDateNum(dt) {
    const n = setsuNo(dt);
    const target = Astro.norm360(315 + (n - 1) * 30);
    const noon = Astro.jd(jdn(dt), 12);
    const guess = noon - Astro.norm360(Astro.sunLong(noon) - target) / 0.9856;
    return Astro.jstDateNum(Astro.solarTermTime(target, guess));
  }

  function juniChoku(dt) {
    return CHOKU[((branchIndex(dt) - buildBranch(dt)) % 12 + 12) % 12];
  }

  const shuku28 = (dt) => SHUKU[((jdn(dt) + 11) % 28 + 28) % 28];

  function nearestKasshi(dn) {
    const r = etoIndexJdn(dn);
    const next = dn + ((60 - r) % 60), prev = next - 60;
    return (next - dn) <= (dn - prev) ? next : prev;
  }

  function kyusei(dt) {
    const dn = jdn(dt);
    const sw = [
      { dn: nearestKasshi(Astro.solsticeDateNum(dt.y - 1, false)), yang: true },
      { dn: nearestKasshi(Astro.solsticeDateNum(dt.y, true)), yang: false },
      { dn: nearestKasshi(Astro.solsticeDateNum(dt.y, false)), yang: true },
    ].sort((a, b) => a.dn - b.dn);
    let cur = sw[0];
    for (const s of sw) if (s.dn <= dn) cur = s;
    const diff = dn - cur.dn;
    return KYUSEI[cur.yang ? (diff % 9) + 1 : 9 - (diff % 9)];
  }

  const moonAge = (dt) => Astro.moonAge(jdn(dt));

  function moonPhase(dt) {
    const ld = lunar(dt).d;
    if (ld === 1) return { name: "新月", yomi: "しんげつ", alt: "朔" };
    if (ld <= 6) return { name: "三日月", yomi: "みかづき", alt: "繊月" };
    if (ld <= 8) return { name: "上弦の月", yomi: "じょうげん", alt: "弓張月" };
    if (ld <= 12) return { name: "十日余りの月", yomi: "", alt: "宵月" };
    if (ld <= 14) return { name: "小望月", yomi: "こもちづき", alt: "待宵月" };
    if (ld === 15) return { name: "満月", yomi: "まんげつ", alt: "望" };
    if (ld <= 18) return { name: "十六夜", yomi: "いざよい", alt: "立待月" };
    if (ld <= 21) return { name: "更待月", yomi: "ふけまちづき", alt: "" };
    if (ld <= 24) return { name: "下弦の月", yomi: "かげん", alt: "弓張月" };
    if (ld <= 28) return { name: "有明月", yomi: "ありあけ", alt: "暁月" };
    return { name: "晦の月", yomi: "つごもり", alt: "" };
  }

  function sekki(dt) {
    const dn = jdn(dt);
    const l0 = Astro.sunLong(Astro.jd(dn, 0)), l1 = Astro.sunLong(Astro.jd(dn, 24));
    const k0 = Math.floor(l0 / 15), k1 = Math.floor(l1 / 15);
    if (k1 === k0 && l1 >= l0) return null;
    const term = (k0 + 1) % 24;
    const idx = ((term - 21) % 24 + 24) % 24;
    const s = SEKKI_LIST[idx];
    return { name: s[0], yomi: s[1], note: s[2] };
  }

  function kou(dt) {
    const lam = Astro.sunLong(Astro.jd(jdn(dt), 24));
    const idx = ((Math.floor(lam / 5) - 63) % 72 + 72) % 72;
    const k = KOU_LIST[idx];
    return { name: k[0], yomi: k[1], note: k[2], group: `${SEKKI_LIST[Math.floor(idx / 3)][0]} ${["初候", "次候", "末候"][idx % 3]}` };
  }

  // ---- 祝日 ----
  function dateFromJdn(dn, hint) {
    let y = hint, off = dn - Astro.jdn(y, 1, 1);
    while (off < 0) { y -= 1; off = dn - Astro.jdn(y, 1, 1); }
    while (off >= Astro.jdn(y + 1, 1, 1) - Astro.jdn(y, 1, 1)) { y += 1; off = dn - Astro.jdn(y, 1, 1); }
    let m = 1;
    const dim = (yy, mm) => Astro.jdn(mm === 12 ? yy + 1 : yy, mm === 12 ? 1 : mm + 1, 1) - Astro.jdn(yy, mm, 1);
    while (off >= dim(y, m)) { off -= dim(y, m); m += 1; }
    return { y, m, d: off + 1 };
  }

  function holidays(y) {
    if (memo.holidays.has(y)) return memo.holidays.get(y);
    const list = [
      [1, 1, "元日"], [2, 11, "建国記念の日"], [4, 29, "昭和の日"], [5, 3, "憲法記念日"],
      [5, 4, "みどりの日"], [5, 5, "こどもの日"], [8, 11, "山の日"], [11, 3, "文化の日"], [11, 23, "勤労感謝の日"],
    ];
    if (y >= 2020) list.push([2, 23, "天皇誕生日"]);
    const nthMon = (m, n) => {
      const wd1 = weekday({ y, m, d: 1 });
      return 1 + ((1 - wd1) % 7 + 7) % 7 + (n - 1) * 7;
    };
    list.push([1, nthMon(1, 2), "成人の日"], [7, nthMon(7, 3), "海の日"], [9, nthMon(9, 3), "敬老の日"], [10, nthMon(10, 2), "スポーツの日"]);
    const shunbun = Astro.jstDateNum(Astro.solarTermTime(0, Astro.jd(Astro.jdn(y, 3, 20), 12)));
    const shubun = Astro.jstDateNum(Astro.solarTermTime(180, Astro.jd(Astro.jdn(y, 9, 23), 12)));
    list.push([3, shunbun - Astro.jdn(y, 3, 0), "春分の日"], [9, shubun - Astro.jdn(y, 9, 0), "秋分の日"]);
    const map = {};
    for (const [m, d, name] of list) map[`${m}-${d}`] = name;
    // 振替休日
    for (const [m, d] of list) {
      if (weekday({ y, m, d }) !== 0) continue;
      let dn = Astro.jdn(y, m, d) + 1;
      for (;;) {
        const dt = dateFromJdn(dn, y);
        if (!map[`${dt.m}-${dt.d}`]) { map[`${dt.m}-${dt.d}`] = "振替休日"; break; }
        dn += 1;
      }
    }
    // 国民の休日
    for (const [m, d] of list) {
      const dn = Astro.jdn(y, m, d);
      const mid = dateFromJdn(dn + 1, y), after = dateFromJdn(dn + 2, y);
      if (map[`${after.m}-${after.d}`] && !map[`${mid.m}-${mid.d}`] && weekday(mid) !== 0) {
        map[`${mid.m}-${mid.d}`] = "国民の休日";
      }
    }
    memo.holidays.set(y, map);
    return map;
  }

  const holiday = (dt) => holidays(dt.y)[`${dt.m}-${dt.d}`] || null;

  // ---- 年中行事（固定＋動的） ----
  function yearEvents(y) {
    if (memo.events.has(y)) return memo.events.get(y);
    const map = {};
    const put = (dt, name) => {
      const k = `${dt.m}-${dt.d}`;
      map[k] = map[k] ? `${map[k]}・${name}` : name;
    };
    const addDays = (dt, k) => dateFromJdn(Astro.jdn(dt.y, dt.m, dt.d) + k, dt.y);
    const termDate = (target, gm, gd) =>
      dateFromJdn(Astro.jstDateNum(Astro.solarTermTime(target, Astro.jd(Astro.jdn(y, gm, gd), 12))), y);
    const nthSunday = (m, n) => {
      const wd1 = weekday({ y, m, d: 1 });
      return { y, m, d: 1 + ((7 - wd1) % 7) + (n - 1) * 7 };
    };
    const risshun = termDate(315, 2, 4);
    put(risshun, "立春"); put(addDays(risshun, -1), "節分");
    put(addDays(termDate(0, 3, 20), -3), "彼岸入り");
    put(addDays(termDate(180, 9, 23), -3), "彼岸入り");
    put(termDate(80, 6, 11), "入梅");
    put(termDate(90, 6, 21), "夏至");
    put(termDate(270, 12, 22), "冬至");
    // 土用の丑
    const doyoStart = Astro.jdn(y, termDate(117, 7, 20).m, termDate(117, 7, 20).d);
    const risshuu = Astro.jdn(y, termDate(135, 8, 7).m, termDate(135, 8, 7).d);
    const ushi = [];
    for (let dn = doyoStart; dn < risshuu; dn++) if (etoIndexJdn(dn) % 12 === 1) ushi.push(dn);
    if (ushi[0]) put(dateFromJdn(ushi[0], y), "土用の丑の日");
    if (ushi[1]) put(dateFromJdn(ushi[1], y), "二の丑");
    // 中秋の名月（旧暦8/15）
    let mn = Astro.jdn(y, 9, 1);
    for (let i = 0; i < 60; i++) {
      const r = Astro.lunarDate(mn);
      if (r.m === 8 && !r.leap && r.d === 15) { put(dateFromJdn(mn, y), "中秋の名月"); break; }
      mn += (r.m === 8 && !r.leap) ? (15 - r.d) : 1;
    }
    put(nthSunday(5, 2), "母の日");
    put(nthSunday(6, 3), "父の日");
    for (const [k, v] of Object.entries(holidays(y))) if (!map[k]) map[k] = v;
    for (const [k, v] of Object.entries(YEAR_EVENTS)) {
      if (map[k]) { if (!map[k].split("・").includes(v)) map[k] = `${v}・${map[k]}`; }
      else map[k] = v;
    }
    memo.events.set(y, map);
    return map;
  }

  const event = (dt) => yearEvents(dt.y)[`${dt.m}-${dt.d}`] || null;

  // ---- 選日 ----
  const tenshaEto = (n) => [14, 30, 44, 0][Math.floor((n - 1) / 3)];
  const boso = (n, b) => {
    switch (Math.floor((n - 1) / 3)) {
      case 0: return b === 11 || b === 0;
      case 1: return b === 2 || b === 3;
      case 2: return b === 4 || b === 1 || b === 10 || b === 7;
      default: return b === 8 || b === 9;
    }
  };
  const sanrinbo = (n) => { const r = n % 3; return r === 1 ? 11 : (r === 2 ? 2 : 6); };

  function senjitsu(dt) {
    const n = setsuNo(dt), b = branchIndex(dt), s = stemIndex(dt), ei = etoIndex(dt), l = lunar(dt);
    const out = [];
    const add = (name, type, note, big = false) => out.push({ name, type, note, big });
    if (ei === tenshaEto(n)) add("天赦日", "吉", "暦で最上の大吉日。天が万物の罪を赦す", true);
    if ((ICHI[n] || []).includes(b)) add("一粒万倍日", "吉", "一粒が万倍に実る。事始め・出資に吉", true);
    if (DAIMYO.includes(ei)) add("大明日", "吉", "天地に陽光が満ちる大吉日。建築・移転・旅行に吉");
    if (KAMIYOSHI.includes(ei)) add("神吉日", "吉", "神事に吉。参拝・祭祀・先祖供養に良い日");
    if (shuku28(dt) === "鬼") add("鬼宿日", "吉", "二十八宿の鬼。婚礼以外は万事に大吉");
    if ((ei >= 0 && ei <= 4) || (ei >= 15 && ei <= 19) || (ei >= 45 && ei <= 49)) add("天恩日", "吉", "天の恩恵を受ける日。慶事・祝い事に吉");
    if (boso(n, b)) add("母倉日", "吉", "天が人を慈しむ日。婚礼・建築・移転に吉");
    if (s === TOKUTOKU[n]) add("月徳日", "吉", "その月の福徳を司る神の在る日。造作・修造に吉");
    if (ei === 0) add("甲子", "吉", "六十干支の初日。大黒天の縁日、事始めに吉");
    if (ei === 5) add("己巳", "吉", "弁財天の縁日。金運・財運に特に吉");
    else if (b === 5) add("巳の日", "吉", "弁財天の縁日。金運・芸事に吉");
    if (ei === 56) add("庚申", "吉", "庚申待の日。徹夜で過ごし福を願う");
    if (b === 2) add("寅の日", "吉", "金運招来の吉日。旅立ち・財布の新調に吉");
    if (b === JUSHI[n]) add("受死日", "凶", "下段で最悪の大凶日（●黒日）。葬儀以外は慎む", true);
    if (b === JUSSHI[n]) add("十死日", "凶", "受死日に次ぐ大凶日。何事にも凶、葬儀も凶", true);
    if (b === sanrinbo(n)) add("三隣亡", "凶", "建築の大凶日。棟上げ・土起こしは忌む");
    if (l.d % 8 === FUJOJU[l.m]) add("不成就日", "凶", "何事も成就しにくい日。事始め・願掛けに凶");
    if (ei >= 48 && ei <= 59 && ![49, 52, 54, 58].includes(ei)) add("八専", "凶", "同気が重なる凶期。法事・種蒔き等を忌む");
    if (b === KIKO[n]) add("帰忌日", "凶", "帰途・移転・金の貸出を忌む日");
    if (b === CHIIMI[n]) add("血忌日", "凶", "血を見る事を忌む。手術・狩猟・殺生に凶");
    if (b === TENKA[n]) add("天火日", "凶", "棟上げ・屋根葺きで火災を招くとされる凶日");
    if (b === JIKA[n]) add("地火日", "凶", "基礎工事・柱立て・種蒔き・築墓に凶");
    if (b === TAIKA[n]) add("大禍日", "凶", "三箇の悪日。万事に凶、特に破壊的な事を忌む");
    if (b === ROJAKU[n]) add("狼藉日", "凶", "三箇の悪日。万事に凶とされる");
    if (b === METSU[n]) add("滅門日", "凶", "三箇の悪日。一門を滅ぼすとされ万事に凶");
    if (jdn(dt) - setsuStartDateNum(dt) + 1 === OMO[n]) add("往亡日", "凶", `出行・移転・婚礼を忌む日（節入りより${OMO[n]}日目）`);
    if (b === 5 || b === 11) add("重日", "凶", "吉凶が重なる日。婚礼は再婚に通ずとして忌む");
    if ((FUKU[n] || []).includes(s)) add("復日", "凶", "重日と同義。吉は重なるが婚礼・葬儀は凶");
    if ((KUE[l.m] || []).includes(ei)) add("凶会日", "凶", "陰陽の調和が乱れる日。婚礼・祭祀・旅行など万事に凶");
    return out;
  }

  // ---- 潮汐・日の出入り ----
  function tideName(dt) {
    const ld = lunar(dt).d;
    if ([1, 2, 15, 16, 17, 18].includes(ld)) return "大潮";
    if ([8, 9, 23, 24].includes(ld)) return "小潮";
    if (ld === 10 || ld === 25) return "長潮";
    if (ld === 11 || ld === 26) return "若潮";
    return "中潮";
  }

  const region = (id) => REGIONS.find((r) => r.id === id) || REGIONS[0];
  const TIDE_PERIOD = 745;

  function tideParams(dt, regionId) {
    const r = region(regionId);
    const ld = lunar(dt).d;
    const spring = Math.abs(Math.cos((ld - 1) / 29.53 * 2 * Math.PI));
    const range = (40 + 150 * spring) * r.amp;
    const hi1 = ((((ld - 1) * 50.5 + r.off + 200) % TIDE_PERIOD) + TIDE_PERIOD) % TIDE_PERIOD;
    return { r, range, period: TIDE_PERIOD, hi1, hi: r.base + range / 2, lo: r.base - range / 2, base: r.base };
  }

  // 満潮・干潮の極値を、日の前後まで含めて生成（カーブと干満点で共通利用）
  function tideExtrema(p) {
    const j = (b, a, s) => Math.round(b + Math.sin(s) * a);
    const ex = [];
    for (let k = -1; k <= 3; k++) {
      const th = p.hi1 + k * p.period;
      ex.push({ type: "満潮", min: th, level: j(p.hi, 9, th) });
      const tl = p.hi1 - p.period / 2 + k * p.period;
      ex.push({ type: "干潮", min: tl, level: j(p.lo, 7, tl + 9) });
    }
    ex.sort((a, b) => a.min - b.min);
    return ex;
  }

  function tides(dt, regionId) {
    const p = tideParams(dt, regionId);
    const list = tideExtrema(p).filter((e) => e.min >= 0 && e.min < 1440);
    return { name: tideName(dt), range: Math.round(p.range), region: p.r, events: list, base: p.base, hi: p.hi, lo: p.lo };
  }

  function tideCurve(dt, regionId, samples) {
    const p = tideParams(dt, regionId);
    const ex = tideExtrema(p);
    const pts = [];
    let mn = Infinity, mx = -Infinity;
    let seg = 0;
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * 1440;
      // t を挟む極値 e0(≤t) と e1(>t) を探す
      while (seg < ex.length - 2 && ex[seg + 1].min <= t) seg++;
      const e0 = ex[seg], e1 = ex[seg + 1];
      const frac = (t - e0.min) / (e1.min - e0.min);
      // 半余弦補間：両端の極値（干満点）をなめらかに通る
      const level = e0.level + (e1.level - e0.level) * (1 - Math.cos(Math.PI * frac)) / 2;
      if (level < mn) mn = level;
      if (level > mx) mx = level;
      pts.push({ min: t, level });
    }
    return { pts, max: mx, min: mn };
  }

  function fmtTime(mins) {
    if (mins == null) return "--:--";
    let m = ((Math.round(mins) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60), mm = m % 60;
    return `${h < 10 ? "0" : ""}${h}:${mm < 10 ? "0" : ""}${mm}`;
  }

  function sunEvent(dt, lat, lng, isRise) {
    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const N = jdn(dt) - Astro.jdn(dt.y, 1, 1) + 1, zenith = 90.833, lngHour = lng / 15;
    const t = N + ((isRise ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * D2R) + 0.020 * Math.sin(2 * M * D2R) + 282.634;
    L = ((L % 360) + 360) % 360;
    let RA = R2D * Math.atan(0.91764 * Math.tan(L * D2R));
    RA = ((RA % 360) + 360) % 360;
    RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
    RA /= 15;
    const sinDec = 0.39782 * Math.sin(L * D2R), cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(zenith * D2R) - sinDec * Math.sin(lat * D2R)) / (cosDec * Math.cos(lat * D2R));
    if (cosH > 1 || cosH < -1) return null;
    let H = isRise ? 360 - R2D * Math.acos(cosH) : R2D * Math.acos(cosH);
    H /= 15;
    const T = H + RA - 0.06571 * t - 6.622;
    let UT = (T - lngHour) % 24; if (UT < 0) UT += 24;
    return Math.round(((UT + 9) % 24) * 60);
  }

  const sun = (dt, regionId) => {
    const r = region(regionId);
    return { rise: sunEvent(dt, r.lat, r.lng, true), set: sunEvent(dt, r.lat, r.lng, false) };
  };

  // ---- 年号 ----
  const KANJI1 = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  function kanjiNum(n) {
    if (n <= 10) return KANJI1[n];
    if (n < 20) return "十" + (n % 10 ? KANJI1[n % 10] : "");
    if (n < 40) return KANJI1[Math.floor(n / 10)] + "十" + (n % 10 ? KANJI1[n % 10] : "");
    return String(n);
  }
  const eraString = (y) => `令和${y - 2018}年`;
  const eraKanjiString = (y) => `令和${kanjiNum(y - 2018)}年`;
  const kokiString = (y) => `皇紀${y + 660}年`;
  const yearEtoKanji = (y) => { const i = ((y - 4) % 60 + 60) % 60; return KAN[i % 10] + SHI[i % 12]; };

  // ---- 日データ ----
  function dayData(dt) {
    const wd = weekday(dt);
    const l = lunar(dt);
    const ry = ROKUYO[(l.m + l.d) % 6];
    const chk = juniChoku(dt);
    const shk = shuku28(dt);
    return {
      date: dt, day: dt.d, weekday: wd, weekdayLabel: WD[wd], lunar: l,
      rokuyo: ry, rokuyoYomi: ROKUYO_YOMI[ry], rokuyoNote: ROKUYO_NOTE[ry],
      choku: chk, chokuYomi: CHOKU_YOMI[CHOKU.indexOf(chk)], chokuNote: CHOKU_NOTE[chk],
      shuku: shk, shukuYomi: SHUKU_YOMI[SHUKU.indexOf(shk)], shukuNote: SHUKU_NOTE[shk],
      kyusei: kyusei(dt), holiday: holiday(dt), senjitsu: senjitsu(dt),
      moonAge: moonAge(dt), moonPhase: moonPhase(dt),
      sekki: sekki(dt), kou: kou(dt), eto: eto(dt), event: event(dt),
      tideName: tideName(dt), isSunday: wd === 0, isSaturday: wd === 6,
    };
  }

  function daysInMonth(y, m) {
    return Astro.jdn(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - Astro.jdn(y, m, 1);
  }

  function month(y, m) {
    const out = [];
    for (let d = 1; d <= daysInMonth(y, m); d++) out.push(dayData({ y, m, d }));
    return out;
  }

  function today() {
    // JST基準
    const now = new Date(Date.now() + (9 * 60 + new Date().getTimezoneOffset()) * 60000);
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }

  return {
    WD, WAFU, REGIONS, CAT, KANJI: { KAN, SHI },
    lunar, rokuyo, eto, kyusei, moonAge, moonPhase, sekki, kou, holiday, event,
    senjitsu, tideName, tides, tideCurve, sun, region, fmtTime, kanjiNum,
    eraString, eraKanjiString, kokiString, yearEtoKanji,
    dayData, month, daysInMonth, today,
  };
})();
