import { normalizeQueryTypos } from "./typo-normalizer.js";

export function jsonWithFlatFaqs(data) {
  const flatFaqs = data.categories.flatMap((category) =>
    category.faqs.map((faq) => ({
      ...faq,
      categoryId: category.id,
      categoryName: category.name,
      categoryAliases: category.aliases || []
    }))
  );

  return {
    ...data,
    flatFaqs
  };
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(^|[^a-z0-9])a\s*[/.\-]?\s*s(?![a-z0-9])/gu, "$1as")
    .replace(/([a-z+])(?=\p{Script=Hangul})/gu, "$1 ")
    .replace(/(\p{Script=Hangul})(?=[a-z])/gu, "$1 ")
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeQueryText(value) {
  return normalizeText(normalizeQueryTypos(value).normalized);
}

const STOP_WORDS = new Set([
  "어떻게",
  "무엇인가요",
  "뭔가요",
  "뭐야",
  "뭐가",
  "알려줘",
  "해주세요",
  "하나요",
  "되나요",
  "돼요",
  "있나요",
  "같아요",
  "싶어요",
  "문의",
  "질문"
]);

const QUERY_SYNONYMS = [
  {
    patterns: ["고플러스", "고 플러스", "go plus", "go+", "go"],
    tokens: ["go+"]
  },
  {
    patterns: ["스마트"],
    tokens: ["smart"]
  },
  {
    patterns: ["리프트"],
    tokens: ["lift"]
  },
  {
    patterns: ["잇지", "이지"],
    tokens: ["izzi"]
  },
  {
    patterns: ["이기"],
    tokens: ["iggi"]
  },
  {
    patterns: ["사용설명서", "설명서", "매뉴얼"],
    tokens: ["설명서", "매뉴얼", "사용법"]
  },
  {
    patterns: ["정품등록", "제품등록"],
    tokens: ["정품등록", "시리얼", "보증"]
  },
  {
    patterns: ["안들어", "안 들어", "들어가지", "공급"],
    tokens: ["물공급", "들어가"]
  },
  {
    patterns: ["안열", "안 열", "열리지"],
    tokens: ["마개", "잠김", "열리"]
  },
  {
    patterns: ["안감", "안 감", "잠긴", "리와인더"],
    tokens: ["코드선", "잠김"]
  },
  {
    patterns: ["흔들", "한쪽이 떠", "균형"],
    tokens: ["흔들", "균형", "다리미판"]
  },
  {
    patterns: ["소리", "달그락", "소음"],
    tokens: ["소리", "달그락", "소음"]
  },
  {
    patterns: ["차이", "비교"],
    tokens: ["차이", "비교"]
  },
  {
    patterns: ["교체", "갈아", "교환", "갈기", "갈아야"],
    tokens: ["교체", "교환"]
  },
  {
    patterns: ["호환", "맞나요"],
    tokens: ["호환"]
  },
  {
    patterns: ["취소", "취소하고"],
    tokens: ["취소", "반품", "교환"]
  },
  {
    patterns: ["박스 없이", "박스없이", "박스 없", "포장 어떻게"],
    tokens: ["포장방법", "완충포장", "물통", "분리"]
  },
  {
    patterns: ["몇평", "몇 평", "평수", "커버", "커버 가능", "면적"],
    tokens: ["몇평", "커버면적", "사용면적", "적용면적"]
  },
  {
    patterns: ["탄산 약", "탄산이 약", "탄산 약해", "탄산이 예전", "약한 탄산", "탄산 안", "탄산이 안", "탄산 없음", "가스 약"],
    tokens: ["탄산", "약함", "실린더", "잔량", "차가운물"]
  },
  {
    patterns: ["식세기", "식기 세척기", "식기세척기"],
    tokens: ["식기세척기", "고온", "세척"]
  },
  {
    patterns: ["정품등록", "제품 등록", "제품등록"],
    tokens: ["제품등록", "시리얼", "보증"]
  },
  {
    patterns: ["타사실린더", "다른 실린더", "착한충전소", "착한 충전소"],
    tokens: ["타사", "실린더", "호환", "유상수리"]
  },
  {
    patterns: ["물 뭐", "뭐 써야", "뭐 넣어", "넣어야"],
    tokens: ["물사용", "사용해야", "차가운물"]
  },
  {
    patterns: ["물이 새", "물샘", "누수", "샙니다", "물이 샙니다", "새요"],
    tokens: ["물이새요", "누수", "물통", "as"]
  },
  {
    patterns: ["실린더 어디서", "가스 실린더 어디서", "실린더 사", "실린더 구매처"],
    tokens: ["실린더", "구매", "리필구매", "충전실린더"]
  },
  {
    patterns: ["작동 안", "작동이 안", "안돼요", "안 돼요"],
    tokens: ["작동안됨", "작동안됨"]
  },
  {
    patterns: ["사용법 알려", "사용법", "만드는법", "만드는 법", "어떻게 만"],
    tokens: ["탄산수", "제조", "전용물병", "사용법"]
  },
  {
    patterns: ["소리가 안나", "소리 안나", "윙윙 소리가 안"],
    tokens: ["안남", "안나요"]
  },
  {
    patterns: ["아기고양이", "아기 고양이", "새끼고양이", "새끼 고양이", "어린 고양이"],
    tokens: ["어린고양이", "아기고양이", "어린"]
  },
  {
    patterns: ["몇키로", "몇 키로", "몇kg", "몇 kg", "몸무게 제한", "체중 제한"],
    tokens: ["몸무게제한", "체중", "몸무게"]
  },
  {
    patterns: ["자동공급 안", "자동 공급 안", "공급 안돼", "공급이 안돼", "모래가 안 나와"],
    tokens: ["자동공급이되지않아요", "모래자동공급"]
  },
  {
    patterns: ["세탁 어떻게", "세탁 방법", "빨래 어떻게", "빨아", "빨래", "빨아야"],
    tokens: ["물세탁가능한가요", "세탁", "물세탁", "빨래"]
  },
  {
    patterns: ["스팀분사", "스팀 분사"],
    tokens: ["스팀"]
  },
  {
    patterns: ["다림질이 안", "다림질 안", "구김현상", "구김이 안", "구김 안", "다림질이 거의 안"],
    tokens: ["스팀", "안나와"]
  },
  {
    patterns: ["물 흐름", "물흐름"],
    tokens: ["들어가", "물공급"]
  },
  {
    patterns: ["녹물", "이물질", "부유물", "갈색물", "흙물", "누런물"],
    tokens: ["녹물", "이물질"]
  }
];

function includesCompact(source, target) {
  const sourceCompact = normalizeText(source).replace(/\s+/g, "");
  const targetCompact = normalizeText(target).replace(/\s+/g, "");
  return Boolean(targetCompact) && sourceCompact.includes(targetCompact);
}

function compact(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

const GREETING_QUERIES = new Set([
  "안녕",
  "안녕하세요",
  "안녕하세여",
  "안녕하십니까",
  "안뇽",
  "하이",
  "ㅎㅇ",
  "hi",
  "hello",
  "헬로",
  "반가워",
  "반갑습니다"
]);

const THANKS_QUERIES = [
  "감사합니다",
  "감사해요",
  "고마워",
  "고맙습니다",
  "넵",
  "네",
  "수고하세요",
  "주말잘보내세요"
];

const INSUFFICIENT_QUERIES = new Set([
  "문의",
  "질문",
  "faq",
  "제품문의상담",
  "전원",
  "스펙",
  "모델문의",
  "공식상담메뉴",
  "상담메뉴",
  "자주묻는질문",
  "물나오는부분",
  "물나오는부분이"
]);

function syntheticFaq(id, answer, options = {}) {
  return {
    id,
    categoryId: options.categoryId || "base",
    categoryName: options.categoryName || "기본 응답",
    question: options.question || id,
    answer,
    answer_type: "common",
    keywords: [],
    quick_replies: options.quickReplies || [],
    suppress_action_replies: options.suppressActionReplies ?? true
  };
}

function brandKey(data) {
  const brand = String(data?.brand || "").toLowerCase();
  if (brand.includes("woods") || brand.includes("우즈")) return "woods";
  if (brand.includes("aarke") || brand.includes("아르케")) return "aarke";
  if (brand.includes("litter-robot") || brand.includes("리터로봇")) return "litter-robot";
  if (brand.includes("imetec") || brand.includes("이메텍") || brand.includes("이미텍")) return "imetec";
  return "laurastar";
}

function includesAny(value, patterns) {
  return patterns.some((pattern) => value.includes(compact(pattern)));
}

function findFaqById(data, id) {
  return data.flatFaqs.find((faq) => faq.id === id) || null;
}

function asPriorityMatch(faq, score = 220) {
  return faq ? { faq, score } : null;
}

function priorityMatch(data, query) {
  const queryCompact = compact(normalizeQueryTypos(query).normalized);
  const brand = brandKey(data);
  if (!queryCompact) {
    return asPriorityMatch(syntheticFaq(
      "base-insufficient-detail",
      "문의하실 제품명과 궁금한 내용을 조금 더 구체적으로 입력해 주세요.",
      { question: "추가 정보 요청" }
    ));
  }

  if (
    queryCompact.length <= 24 &&
    THANKS_QUERIES.some((thanks) => {
      const thanksCompact = compact(thanks);
      if (thanksCompact.length <= 2) {
        return queryCompact === thanksCompact || queryCompact.startsWith(thanksCompact + "감사");
      }
      return queryCompact === thanksCompact || queryCompact.includes(thanksCompact);
    })
  ) {
    return asPriorityMatch(syntheticFaq(
      "base-thanks",
      "도움이 필요하시면 언제든지 편하게 문의주시기 바랍니다.\n감사합니다, 좋은 하루 되세요 ☺️\n\n게이트비젼 공식몰 ㅣ 프리미엄 가전 공식수입원\nhttps://gvcurate.com/",
      { question: "감사 인사" }
    ));
  }

  const isAttachment =
    /https?:\/\//u.test(String(query || "")) ||
    includesAny(queryCompact, ["동영상촬영해서보내", "영상보내드립니다", "사진첨부", "영상첨부"]);
  const isPrivateStatus = includesAny(queryCompact, [
    "입금했습니다",
    "입금완료",
    "입금자명",
    "주문번호",
    "검수결과",
    "as결과",
    "as검수결과",
    "as진행상황",
    "as상태",
    "진행상황이궁금",
    "회수이후",
    "회수도늦",
    "회수된이후",
    "언제돌아오",
    "진행이느린",
    "공구진행",
    "공구가",
    "인스타로",
    "담당자연결",
    "민원",
    "아닌거같",
    "확인되면"
  ]);
  const isExplicitHandoff = includesAny(queryCompact, ["상담원연결", "상담사연결"]);
  const isDeferredLaurastar = brand === "laurastar" && includesAny(queryCompact, [
    "물통분실구매",
    "부품만따로구매",
    "따로구매",
    "따로구입",
    "사용중누전",
    "원단이쪼그라",
    "원단이손상",
    "팬이돌다가멈",
    "다리미판분리",
    "솔플레이트를써야",
    "실크도가능",
    "실크가능",
    "다리미판불량",
    "물샘",
    "물이넘쳐",
    "물넘침",
    "빨리처리",
    "불량건",
    "필터교체해도알람",
    "필터를새걸로교환",
    "블루투스"
  ]);
  const isDeferredWoods = brand === "woods" && includesAny(queryCompact, ["맥스기능", "맥스모드"]);

  if (isAttachment || isPrivateStatus || isExplicitHandoff || isDeferredLaurastar || isDeferredWoods) {
    return asPriorityMatch(syntheticFaq(
      "base-human-handoff",
      "상담원 확인이 필요한 문의입니다. 아래 '상담사 연결'을 선택해 주세요.",
      {
        question: "상담원 연결",
        categoryId: "handoff",
        categoryName: "상담원 연결",
        quickReplies: [{ label: "상담사 연결", messageText: "상담원 연결" }]
      }
    ));
  }

  if (INSUFFICIENT_QUERIES.has(queryCompact)) {
    return asPriorityMatch(syntheticFaq(
      "base-insufficient-detail",
      "문의하실 제품명과 궁금한 내용을 조금 더 구체적으로 입력해 주세요.",
      { question: "추가 정보 요청" }
    ));
  }

  if (includesAny(queryCompact, ["문의해요", "제품문의", "제습기문의", "4문의"])) {
    return asPriorityMatch(syntheticFaq(
      "base-insufficient-detail",
      "문의하실 제품명과 궁금한 내용을 조금 더 구체적으로 입력해 주세요.",
      { question: "추가 정보 요청" }
    ));
  }

  if (includesAny(queryCompact, ["매장", "백화점", "팝업"])) {
    return asPriorityMatch(data.flatFaqs.find((faq) => faq.id.endsWith("offline-store-location")));
  }

  if (brand === "aarke" && includesAny(queryCompact, ["물이뿜", "물뿜어짐", "위로뿜"])) {
    return asPriorityMatch(findFaqById(data, "aarke-water-splashing"));
  }

  if (brand === "aarke" && includesAny(queryCompact, ["물이새", "물샘", "바닥에물", "받침아래물", "물이고여"])) {
    return asPriorityMatch(findFaqById(data, "aarke-leak-during-carbonation"));
  }

  const isAarkeCylinderRefillOrder =
    brand === "aarke" &&
    includesAny(queryCompact, ["실린더", "가스"]) &&
    includesAny(queryCompact, ["충전", "리필"]) &&
    includesAny(queryCompact, ["접수", "신청", "구매", "주문", "사고싶", "어디서"]);

  if (isAarkeCylinderRefillOrder) {
    return asPriorityMatch(findFaqById(data, "aarke-refill-cylinder-purchase"));
  }

  if (brand === "aarke" && includesAny(queryCompact, ["실린더한통", "실린더벌써다", "가스가벌써다", "실린더사용량"])) {
    return asPriorityMatch(syntheticFaq(
      "aarke-cylinder-clarification",
      "실린더 한 개의 예상 사용량이 궁금하신가요, 충전 실린더 구매 방법이 궁금하신가요?",
      {
        question: "실린더 문의 확인",
        categoryId: "cylinder",
        categoryName: "실린더/리필",
        quickReplies: [
          { label: "실린더 사용량", messageText: "실린더 한 개로 어느 정도의 탄산수를 만들 수 있나요?" },
          { label: "충전 실린더 구매", messageText: "충전 실린더는 어떻게 구매하나요?" }
        ]
      }
    ));
  }

  if (brand === "laurastar" && includesAny(queryCompact, ["수돗물", "생수써도돼", "어떤물넣어"])) {
    return asPriorityMatch(findFaqById(data, "common-water-type"));
  }

  if (brand === "laurastar" && includesAny(queryCompact, ["as신청", "as진행하고싶", "as어떻게", "as관련문의", "as관련"])) {
    return asPriorityMatch(findFaqById(data, "as-before-check"));
  }

  if (brand === "laurastar" && includesAny(queryCompact, ["필터사용기한", "필터교체기간", "필터언제갈"])) {
    return asPriorityMatch(findFaqById(data, "izzi-lift-filter-replacement"));
  }

  if (brand === "laurastar" && includesAny(queryCompact, ["필터가잘빠", "필터잘빠", "필터가빠지", "필터고정안"])) {
    return asPriorityMatch(findFaqById(data, "lift-filter-not-fixed"));
  }

  if (brand === "laurastar" && includesAny(queryCompact, ["스팀이안나", "스팀안나", "스팀은안나오고열만"])) {
    return asPriorityMatch(findFaqById(data, "common-no-steam-diagnostic"));
  }

  if (brand === "laurastar" && includesAny(queryCompact, ["코드선", "코드가안감", "전선이안들어", "리와인더"])) {
    return asPriorityMatch(findFaqById(data, "izzi-lift-cord-lock"));
  }

  if (brand === "laurastar" && includesAny(queryCompact, ["부품이하나없", "나사가안왔", "구성품이안왔", "따로배송"])) {
    return asPriorityMatch(findFaqById(data, "delivery-components-separate"));
  }

  if (
    brand === "laurastar" &&
    includesAny(queryCompact, ["물부족불", "물부족경고", "물이투입이안", "물표시가빨갛", "물통에물이있는데물부족", "물도많은데빨간", "물많은데빨간", "물이있는데빨간"]) &&
    !includesAny(queryCompact, ["smart", "스마트", "izzi", "잇지", "lift", "리프트"])
  ) {
    return asPriorityMatch(syntheticFaq(
      "laurastar-water-warning-model-clarification",
      "사용 중인 모델을 선택해 주세요.",
      {
        question: "물 부족 경고 모델 확인",
        categoryId: "troubleshoot",
        categoryName: "문제 해결",
        quickReplies: [
          { label: "Smart", messageText: "Smart에 물을 채웠는데 보일러통으로 들어가지 않는 것 같아요." },
          { label: "IZZI", messageText: "IZZI에 물이 있는데 물 부족 경고등이 떠요." },
          { label: "Lift", messageText: "Lift에 물이 있는데 물 부족 경고등이 떠요." }
        ]
      }
    ));
  }

  if (brand === "woods" && includesAny(queryCompact, ["물도없는데램프", "첫사용인데빨간", "물통을비웠는데", "물비움표시"])) {
    return asPriorityMatch(findFaqById(data, "woods-수조를-비웠는데-물비움-표시등이-점등돼요"));
  }

  if (brand === "woods" && includesAny(queryCompact, ["작동되다가수시로꺼", "전원이안켜", "사용중멈", "먹통"])) {
    return asPriorityMatch(findFaqById(data, "woods-작동이-안돼요"));
  }

  if (brand === "woods" && includesAny(queryCompact, ["필터교체", "갈아끼우는법"])) {
    return asPriorityMatch(findFaqById(data, "woods-필터-교환은-어떻게-하나요"));
  }

  if (brand === "woods" && includesAny(queryCompact, ["필터청소", "필터관리법"])) {
    return asPriorityMatch(findFaqById(data, "woods-필터-관리는-어떻게-하나요"));
  }

  if (brand === "woods" && includesAny(queryCompact, ["필터어디서사", "필터구매"])) {
    return asPriorityMatch(findFaqById(data, "woods-필터는-어디에서-구매하나요"));
  }

  if (brand === "woods" && includesAny(queryCompact, ["어떤필터", "필터종류"])) {
    return asPriorityMatch(findFaqById(data, "woods-어떤-필터를-사용하나요"));
  }

  if (brand === "woods" && includesAny(queryCompact, ["습도확인", "습도측정", "표시되는습도", "설정습도와현재습도"])) {
    return asPriorityMatch(findFaqById(data, "woods-습도-조절-단계별-습도가-어떻게-되나요-습도-조절-레버"));
  }

  if (brand === "woods" && includesAny(queryCompact, ["물이새", "물샘", "누수", "물이샙", "물이샙니다", "물새"])) {
    return asPriorityMatch(findFaqById(data, "woods-제품에서-물이-새요"));
  }

  if (brand === "aarke" && includesAny(queryCompact, ["사용법", "만드는법", "탄산수만드는", "어떻게사용", "어떻게만들"])) {
    return asPriorityMatch(findFaqById(data, "aarke-how-to-use"));
  }

  if (brand === "litter-robot" && includesAny(queryCompact, ["아기고양이", "새끼고양이", "어린고양이"])) {
    return asPriorityMatch(findFaqById(data, "litter-robot-어린-고양이도-사용할수-있나요"));
  }

  if (brand === "litter-robot" && includesAny(queryCompact, ["몇키로까지", "몇kg까지", "몸무게제한", "체중제한", "고양이몇키로"])) {
    return asPriorityMatch(findFaqById(data, "litter-robot-몸무게-제한이-있나요"));
  }

  if (brand === "litter-robot" && includesAny(queryCompact, ["체중이자꾸", "체중이다르", "몸무게가다르", "다르게나와", "몸무게측정오류"])) {
    return asPriorityMatch(findFaqById(data, "litter-robot-고양이-몸무게가-제대로-측정되지-않아요"));
  }

  if (brand === "litter-robot" && includesAny(queryCompact, ["호퍼모래자동공급", "자동공급안", "공급이안돼", "공급안돼", "모래자동공급"])) {
    return asPriorityMatch(findFaqById(data, "litter-robot-호퍼를-설치했는데-모래-자동-공급이-되지-않아요"));
  }

  if (brand === "litter-robot" && includesAny(queryCompact, ["회전하다멈", "회전중멈", "돌다가멈", "글로브멈", "회전멈춤"])) {
    return asPriorityMatch(findFaqById(data, "litter-robot-파란색-5-칸-plus-흰색-5-칸-교차"));
  }

  if (brand === "litter-robot" && includesAny(queryCompact, ["호퍼오류", "호퍼에러", "호퍼모터", "호퍼걸림", "리터호퍼오류"])) {
    return asPriorityMatch(findFaqById(data, "litter-robot-호퍼-설치-후-모터-걸림-오류가-발생했어요"));
  }

  if (brand === "imetec" && includesAny(queryCompact, ["조절기깜빡", "파란불", "파란불빛", "깜빡거", "깜박거"])) {
    return asPriorityMatch(findFaqById(data, "imetec-조절기-파란불빛이-깜빡거려요-깜빡거리는-모든-문의"));
  }

  if (brand === "imetec" && includesAny(queryCompact, ["조절기구매", "컨트롤러구매", "부품구매"])) {
    return asPriorityMatch(findFaqById(data, "imetec-조절기-구매-문의"));
  }

  if (brand === "imetec" && includesAny(queryCompact, ["안따뜻", "따뜻하지", "온열이없", "미지근", "온도가낮"])) {
    return asPriorityMatch(findFaqById(data, "imetec-너무-안-따뜻해요-불량아닌가요-온열이-없어요"));
  }

  if (brand === "imetec" && includesAny(queryCompact, ["건조기", "탈수", "재탈수"])) {
    return asPriorityMatch(findFaqById(data, "imetec-탈수해도-되나요-건조기-사용-가능한가요"));
  }

  if (brand === "imetec" && includesAny(queryCompact, ["물세탁", "세탁가능", "드럼세탁", "손세탁", "세탁", "빨래"]) && !includesAny(queryCompact, ["삶", "삶음", "삶아", "95도"])) {
    return asPriorityMatch(findFaqById(data, "imetec-물세탁-가능한가요"));
  }

  if (brand === "aarke" && queryCompact === "실린더") {
    return asPriorityMatch(syntheticFaq(
      "disambiguation-실린더",
      "'실린더' 관련하여 자주 찾으시는 질문입니다.\n궁금하신 항목을 선택해 주세요.",
      {
        question: "실린더 확인",
        categoryId: "cylinder",
        categoryName: "실린더/리필",
        quickReplies: [
          { label: "충전 실린더 구매", messageText: "충전 실린더는 어떻게 구매하나요?" },
          { label: "리필 실린더 안내", messageText: "충전 리필 실린더란 무엇인가요?" },
          { label: "실린더 교체 방법", messageText: "실린더 교체는 어떻게 하나요?" },
          { label: "실린더 사용량", messageText: "실린더 한 개로 어느 정도의 탄산수를 만들 수 있나요?" }
        ],
        suppress_action_replies: true
      }
    ));
  }

  if (brand === "imetec" && includesAny(queryCompact, ["멀티탭", "콘센트", "고용량멀티탭"])) {
    return asPriorityMatch(findFaqById(data, "imetec-멀티탭-사용은-왜-안되는거죠"));
  }

  if (brand === "imetec" && includesAny(queryCompact, ["as접수", "a/s접수", "고장접수", "수리접수"])) {
    return asPriorityMatch(findFaqById(data, "imetec-전기요-A-S-접수해주세요"));
  }

  return null;
}

function isGreetingQuery(query) {
  const queryText = compact(query);
  return GREETING_QUERIES.has(queryText);
}

function displayBrandName(data) {
  const brand = String(data?.brand || "").toLowerCase();

  if (brand.includes("woods") || brand.includes("우즈")) return "우즈";
  if (brand.includes("laurastar") || brand.includes("로라스타")) return "로라스타";
  if (brand.includes("litter-robot") || brand.includes("리터로봇")) return "리터로봇";
  if (brand.includes("imetec") || brand.includes("이메텍") || brand.includes("이미텍")) return "이메텍";
  return data?.brand || "고객센터";
}

function baseGreetingFaq(data) {
  const brandName = displayBrandName(data);

  return {
    id: "base-greeting",
    categoryId: "base",
    categoryName: "기본 응답",
    question: "인사말",
    answer: `안녕하세요. ${brandName} 고객센터 챗봇입니다.\n궁금하신 내용을 입력해 주세요.`,
    answer_type: "common",
    keywords: []
  };
}

const CORE_ACTION_STEM_SYNONYMS = {
  "갈": ["교체", "교환"],
  "빨": ["세탁", "물세탁", "빨래"],
  "사": ["구매"],
  "써": ["사용"],
  "새": ["누수", "물샘"],
  "틀": ["전원", "작동"],
  "켜": ["전원", "작동"],
  "꺼": ["전원", "종료"],
  "빼": ["분리", "탈착"],
  "닦": ["청소", "세척"]
};

const ACTION_SYMPTOM_TOKENS = new Set([
  "누수", "물샘", "새", "새요", "샙니다",
  "스팀", "물부족", "물공급", "들어가", "안들어", "보일러", "석회", "다림질",
  "안나", "안나와", "안돼", "안됨", "미작동", "작동안됨",
  "고장", "오류", "에러", "수리", "접수", "as", "보증", "무상", "유상",
  "구매", "구입", "리필", "교체", "교환",
  "세탁", "빨래", "물세탁", "손세탁",
  "소음", "진동", "소리", "깜빡", "점등", "과열", "뜨거",
  "차이", "비교", "호환", "버튼", "레버", "센서", "배수",
  "몸무게", "체중", "적응", "청소", "세척", "분리", "탈착",
  "녹물", "이물질", "부유물"
]);

function stemToken(token) {
  let cleaned = token
    .replace(/(입니다|합니다|해주세요|했어요|할게요|인가요|나요|어요|아요|해요|돼요|되요)$/u, "")
    .replace(/(으로|에서|에게|까지|부터|처럼|이라|라고|하고)$/u, "")
    .replace(/(는데|은데|지만|인가|니까|으면|다면)$/u, "")
    .replace(/(은|는|이|가|을|를|의|에|로|과|와|도|만|이나|나)$/u, "");

  if (["전기요", "담요", "필요", "강아지", "먼지"].includes(cleaned)) return cleaned;

  return cleaned
    .replace(/요$/u, "")
    .replace(/지$/u, "");
}

function tokenize(value, options = {}) {
  const expandSynonyms = options.expandSynonyms !== false;
  const normalized = expandSynonyms ? normalizeQueryText(value) : normalizeText(value);
  const rawTokens = normalized.split(" ").map(stemToken);
  const tokens = rawTokens.filter(
    (token) => (token.length >= 2 || /^[imu]$/u.test(token)) && !STOP_WORDS.has(token)
  );

  if (expandSynonyms) {
    const normalizedCompact = normalized.replace(/\s+/g, "");
    for (const synonym of QUERY_SYNONYMS) {
      if (synonym.patterns.some((pattern) => normalizedCompact.includes(compact(pattern)))) {
        tokens.push(...synonym.tokens);
      }
    }
    for (const raw of rawTokens) {
      if (CORE_ACTION_STEM_SYNONYMS[raw]) {
        tokens.push(...CORE_ACTION_STEM_SYNONYMS[raw]);
      }
    }
  }

  return [...new Set(tokens)];
}

function getProductAliases(faq) {
  return (faq.categoryAliases || [])
    .map(normalizeText)
    .filter(Boolean);
}

function hasProductHint(faq, query) {
  const queryCompact = normalizeQueryText(query).replace(/\s+/g, "");
  return getProductAliases(faq).some((alias) => queryCompact.includes(compact(alias)));
}

function hasWaterTypeIntent(query, queryTokens) {
  const queryCompact = compact(query);
  const hasWaterTerm =
    queryCompact.includes("물") ||
    queryTokens.some((token) =>
      ["수돗물", "정수물", "증류수", "생수", "물사용"].includes(token)
    );
  const hasUseTerm = queryTokens.some((token) =>
    token === "사용" || token.includes("사용") || token === "써" || token === "쓰"
  );
  const hasSymptomTerm = queryTokens.some((token) =>
    ["부족", "경고등", "물부족", "물공급", "들어가", "부레", "필터", "스팀"].includes(token)
  );

  return hasWaterTerm && !hasSymptomTerm && (hasUseTerm || queryTokens.includes("증류수"));
}

function scoreFaq(faq, query) {
  const normalizedQuery = normalizeQueryText(query);
  const queryTokens = tokenize(query);
  const question = normalizeText(faq.question);
  const questionTokens = tokenize(faq.question, { expandSynonyms: false });
  const keywordTokens = (faq.keywords || []).flatMap((keyword) =>
    tokenize(keyword, { expandSynonyms: false })
  );
  const faqTerms = [...new Set([...questionTokens, ...keywordTokens])];
  const productHint = hasProductHint(faq, query);

  let score = 0;
  let strongSignals = 0;

  if (!normalizedQuery || !queryTokens.length) return 0;

  if (question === normalizedQuery) {
    score += 160;
    strongSignals += 2;
  }

  if (includesCompact(question, normalizedQuery) || includesCompact(normalizedQuery, question)) {
    score += 80;
    strongSignals += 1;
  }

  if (productHint) {
    score += 28;
  }

  if (
    faq.id === "common-water-type" &&
    normalizedQuery.includes("어떤 물을 사용")
  ) {
    score += 140;
    strongSignals += 2;
  }

  if (faq.id === "common-water-type" && hasWaterTypeIntent(query, queryTokens)) {
    score += 60;
    strongSignals += 1;
  }

  for (const token of queryTokens) {
    const isActionSymptom = ACTION_SYMPTOM_TOKENS.has(token);

    if (questionTokens.includes(token)) {
      score += (token.length >= 3 ? 26 : 18) + (isActionSymptom ? 22 : 0);
      strongSignals += isActionSymptom ? 2 : 1;
      continue;
    }

    if (keywordTokens.includes(token)) {
      score += (token.length >= 3 ? 34 : 14) + (isActionSymptom ? 22 : 0);
      strongSignals += isActionSymptom ? 2 : 1;
      continue;
    }

    if (faqTerms.some((term) => term.includes(token) || token.includes(term))) {
      score += 7 + (isActionSymptom ? 6 : 0);
    }
  }

  const matchedTermCount = queryTokens.filter((token) =>
    faqTerms.some((term) => term === token || term.includes(token) || token.includes(term))
  ).length;

  if (matchedTermCount >= 2) score += 18;
  if (matchedTermCount >= 3) score += 18;

  if (queryTokens.includes("차이") && !faqTerms.includes("차이")) score -= 30;
  if (queryTokens.includes("교체") && !faqTerms.includes("교체")) score -= 24;
  if (queryTokens.includes("호환") && !faqTerms.includes("호환")) score -= 24;
  if (queryTokens.includes("마개") && !faqTerms.includes("마개")) score -= 35;
  if (queryTokens.includes("코드선") && !faqTerms.includes("코드선")) score -= 60;
  if (queryTokens.includes("코드선") && faqTerms.includes("코드선")) score += 40;
  if (queryTokens.includes("다리미판") && !faqTerms.includes("다리미판")) score -= 18;
  if (faqTerms.includes("go+") && !queryTokens.includes("go+")) score -= 45;
  if ((faqTerms.includes("boss") || faqTerms.includes("보스")) && !queryTokens.some((token) => ["boss", "보스"].includes(token))) {
    score -= 35;
  }
  if (queryTokens.includes("물공급") && !faqTerms.some((term) => ["물공급", "보일러", "들어가"].includes(term))) {
    score -= 35;
  }
  if (faqTerms.includes("글로브") && !queryTokens.includes("글로브")) {
    score -= 35;
  }
  if (faq.id === "smart-board-air-not-working" && !includesAny(compact(query), ["바람", "블로우", "석션", "흡입", "송풍"])) {
    score -= 80;
  }
  const queryCompactText = compact(query);
  const faqTextCompact = compact(`${faq.question} ${(faq.keywords || []).join(" ")} ${faq.categoryName || ""}`);

  if (includesAny(queryCompactText, ["세탁", "빨래", "물세탁", "손세탁"]) && !includesAny(faqTextCompact, ["세탁", "빨래", "물세탁", "손세탁"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["삶", "삶음", "삶아", "95도"]) && !includesAny(faqTextCompact, ["삶", "삶음", "삶아"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["데시벨", "db"]) && !includesAny(faqTextCompact, ["데시벨", "db"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["와트", "소비전력"]) && !includesAny(faqTextCompact, ["와트", "소비전력"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["rpm"]) && !includesAny(faqTextCompact, ["rpm"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["psi", "bar"]) && !includesAny(faqTextCompact, ["psi", "bar"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["가습기", "가습"]) && !includesAny(faqTextCompact, ["가습기", "가습"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["향수", "아로마", "오일", "디퓨저"]) && !includesAny(faqTextCompact, ["향수", "아로마", "오일"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["피자", "음식", "요리"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["와인", "주스", "맥주", "콜라", "음료"]) && !includesAny(faqTextCompact, ["와인", "주스", "맥주", "콜라", "음료"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["나사", "조이", "헐거"]) && !includesAny(faqTextCompact, ["나사", "조이", "헐거"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["강아지", "반려견", "멍멍", "댕댕"]) && !includesAny(faqTextCompact, ["강아지", "반려견", "멍멍"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["임산부", "신생아", "임신"]) && !includesAny(faqTextCompact, ["임산부", "신생아", "임신"])) {
    score -= 100;
  }
  if (includesAny(queryCompactText, ["물청소"]) && !includesAny(faqTextCompact, ["물청소"])) {
    score -= 100;
  }
  if (faq.id === "ud-board-authentic" && !includesAny(compact(query), ["ud", "정품", "유디", "가품"])) {
    score -= 80;
  }

  const hasSpecificExactMatch = queryTokens.some(
    (token) => (token.length >= 3 || ACTION_SYMPTOM_TOKENS.has(token)) && faqTerms.includes(token)
  );
  if (!productHint && matchedTermCount < 2 && strongSignals < 2 && !hasSpecificExactMatch) return 0;

  return score;
}

export function searchFaq(data, query, options = {}) {
  const limit = options.limit || 5;
  if (isGreetingQuery(query)) {
    return [
      {
        faq: baseGreetingFaq(data),
        score: 200
      }
    ].slice(0, limit);
  }

  const priority = priorityMatch(data, query);
  if (priority) return [priority].slice(0, limit);

  const scored = data.flatFaqs
    .map((faq) => ({
      faq,
      score: scoreFaq(faq, query)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

function buildDisambiguationFaq(topMatches, query) {
  const cleanSubject = normalizeText(query).trim();
  const candidates = topMatches.slice(0, 4);

  return {
    id: `disambiguation-${compact(cleanSubject) || "general"}`,
    categoryId: candidates[0]?.faq.categoryId || "base",
    categoryName: candidates[0]?.faq.categoryName || "확인 질문",
    question: `${cleanSubject || "문의"} 확인`,
    answer: `'${cleanSubject}' 관련하여 자주 찾으시는 질문입니다.\n궁금하신 항목을 선택해 주세요.`,
    answer_type: "common",
    keywords: [],
    quick_replies: candidates.map((item) => ({
      label: item.faq.question.length > 20 ? `${item.faq.question.slice(0, 18)}..` : item.faq.question,
      messageText: item.faq.question
    })),
    suppress_action_replies: true
  };
}

export function findBestFaq(data, query) {
  const candidates = searchFaq(data, query, { limit: 5 });
  const [best, second] = candidates;
  if (!best || best.score < 28) return null;

  const queryTokens = tokenize(query);
  if (best.score < 40 && queryTokens.length >= 4) {
    return null;
  }

  if (second && best.score === second.score) {
    const tied = candidates.filter((item) => item.score === best.score);
    if (tied.length >= 2) {
      if (best.score < 50 && queryTokens.length >= 3) {
        return null;
      }
      const distinctQuestions = new Set(tied.map((t) => t.faq.question));
      if (distinctQuestions.size >= 2) {
        return {
          faq: buildDisambiguationFaq(tied, query),
          score: best.score,
          confidence: "medium"
        };
      }
    }
  }

  if (second && best.score - second.score < 8 && best.score < 80) return null;
  return best;
}

export function getSuggestedFaqs(data, categoryId, limit = 5) {
  const candidates = categoryId
    ? data.flatFaqs.filter((faq) => faq.categoryId === categoryId)
    : data.flatFaqs;

  return candidates.slice(0, limit);
}

const RELATED_JOURNEYS = [
  // --- Litter-Robot Scenarios ---
  {
    source: /(어떤 모래|모래.*사용)/u,
    targets: [/(호퍼에 모래|모래.*보관)/u, /(자동 공급)/u, /(청소)/u]
  },
  {
    source: /(모래|배변|화장실)/u,
    targets: [/(청소|냄새|라이너)/u, /(센서|체중)/u, /(적응)/u]
  },
  {
    source: /(고양이.*적응|적응.*고양이|화장실.*안 써|화장실.*거부)/u,
    targets: [/(전원.*끄|적응)/u, /(모래.*종류|어떤 모래)/u, /(센서|체중)/u]
  },
  {
    source: /(센서|체중|몸무게|어린.*고양이)/u,
    targets: [/(몸무게.*제한|체중)/u, /(리셋|초기화)/u, /(적응)/u]
  },
  {
    source: /(라이너|배변통|쓰레기봉투)/u,
    targets: [/(라이너.*교체|비우기)/u, /(청소|냄새)/u, /(구매)/u]
  },

  // --- Laurastar Scenarios ---
  {
    source: /(스팀.*안|스팀.*약|스팀.*나오지)/u,
    targets: [/(석회|카트리지)/u, /(어떤 물|물 사용)/u, /(보증|수리|접수)/u]
  },
  {
    source: /(어떤 물|물 사용|수돗물|정수물|증류수)/u,
    targets: [/(카트리지.*교체|필터.*교체)/u, /(스팀.*확인|스팀.*진단)/u, /(세척|보관)/u]
  },
  {
    source: /(카트리지|필터.*교체|석회)/u,
    targets: [/(카트리지.*구매|필터.*구매)/u, /(어떤 물)/u, /(스팀)/u]
  },
  {
    source: /(다리미판|판.*흔들|균형|커버)/u,
    targets: [/(다리미판.*균형|흔들)/u, /(커버.*세탁|커버.*교체)/u, /(코드선)/u]
  },
  {
    source: /(마개.*안|마개.*열|보일러통|물공급)/u,
    targets: [/(마개.*분리|열리지)/u, /(보일러통.*물|압력)/u, /(as|수리)/u]
  },

  // --- Woods Scenarios ---
  {
    source: /(스펙|제원|몇평|커버|모델 차이)/u,
    targets: [/(습도|설정|단계)/u, /(작동|전원)/u, /(필터|관리)/u]
  },
  {
    source: /(습도.*조절|습도.*설정|습도.*레버)/u,
    targets: [/(연속 배수|배수 가능)/u, /(성에|제상)/u, /(몇평|커버면적)/u]
  },
  {
    source: /(필터.*관리|필터.*청소|필터.*교환|필터.*갈)/u,
    targets: [/(필터.*구매|어디서.*구매)/u, /(필터.*꼭.*써야)/u, /(어떤 필터)/u]
  },
  {
    source: /(배수|호스)/u,
    targets: [/(연속 배수|배수 가능)/u, /(호스.*구매|구매.*호스)/u, /(물통|수조)/u]
  },
  {
    source: /(성에|성에제거|제상|겨울철|차가운 바닥)/u,
    targets: [/(온도|실내)/u, /(압축기|소음)/u, /(as|수리)/u]
  },

  // --- Imetec Scenarios ---
  {
    source: /(세탁|물세탁|빨래|손세탁)/u,
    targets: [/(자연건조|건조기)/u, /(조절기.*분리)/u, /(황변|변색|보풀)/u]
  },
  {
    source: /(온도|안 따뜻|미온|덜 따뜻|온열)/u,
    targets: [/(수면.*친화|포근)/u, /(예열|이불)/u, /(조절기.*불|정상)/u]
  },
  {
    source: /(조절기|컨트롤러|불.*깜빡|온도 단계)/u,
    targets: [/(조절기.*호환|조절기.*구매)/u, /(as.*접수|수리)/u, /(전기요금|소비전력)/u]
  },
  {
    source: /(라텍스|매트리스|소파|침구)/u,
    targets: [/(에어홀|구멍)/u, /(보관|접어서)/u, /(과열|안전)/u]
  },
  {
    source: /(황변|변색|노란가루)/u,
    targets: [/(세탁|물세탁)/u, /(보관|통풍)/u, /(전기요.*사용)/u]
  },

  // --- Aarke Scenarios ---
  {
    source: /(탄산수.*제조|탄산수.*만들|기기.*사용법)/u,
    targets: [/(차가운 물|물 사용)/u, /(레버|버튼|강도)/u, /(전용물병|보틀)/u]
  },
  {
    source: /(충전.*실린더|실린더.*구매|가스.*리필)/u,
    targets: [/(타사.*실린더|호환)/u, /(실린더.*교체|장착)/u, /(사용법)/u]
  },
  {
    source: /(전용 병|보틀|유리병|식기세척기)/u,
    targets: [/(식기세척기.*세척)/u, /(유효기간|교체)/u, /(호환)/u]
  },
  {
    source: /(가스.*새|가스.*누출|물.*넘침|물이 뿜)/u,
    targets: [/(물.*표시선|물량)/u, /(실린더.*결합)/u, /(as|수리)/u]
  },

  // --- Common General Scenarios ---
  {
    source: /(작동|고장|오류|깜빡|점등|소음|안 돼|안되)/u,
    targets: [/(필터|청소|점검)/u, /(^|\s)as($|\s)|수리|접수/u, /(설명서|매뉴얼)/u]
  },
  {
    source: /(구매|구입|가격|재고|매장)/u,
    targets: [/(호환|모델|설치|사용)/u, /(등록|보증)/u, /(배송|교환|반품)/u]
  },
  {
    source: /(^|\s)as($|\s)|수리|접수/u,
    targets: [/(기간|비용|배송|포장)/u, /(접수|고객센터)/u, /(보증|무상|유상)/u]
  },
  {
    source: /(정품등록|제품등록|시리얼)/u,
    targets: [/(보증기간|무상)/u, /(as.*접수)/u, /(구매처)/u]
  }
];

function supportsSelectedModel(faq, selectedModel) {
  if (!selectedModel || faq.answer_type !== "per_model") return true;
  const models = faq.available_models || Object.keys(faq.model_answers || {});
  return models.includes(selectedModel);
}

export function getContextualRelatedFaqs(data, currentFaq, query, options = {}) {
  const limit = options.limit || 3;
  const selectedModel = options.selectedModel || null;
  const sourceText = normalizeText(`${currentFaq.question || ""} ${query || ""}`);
  const sourceTokens = new Set(tokenize(sourceText, { expandSynonyms: false }));
  const journey = RELATED_JOURNEYS.find((item) => item.source.test(sourceText));

  return data.flatFaqs
    .map((faq, index) => {
      if (
        faq.id === currentFaq.id ||
        faq.categoryId === "base" ||
        faq.suppress_action_replies ||
        !supportsSelectedModel(faq, selectedModel)
      ) {
        return null;
      }

      const candidateText = normalizeText(
        `${faq.question || ""} ${(faq.keywords || []).join(" ")} ${faq.categoryName || ""}`
      );
      const candidateTokens = new Set(tokenize(candidateText, { expandSynonyms: false }));
      const sharedTokens = [...sourceTokens].filter((token) => candidateTokens.has(token)).length;
      const targetIndex = journey
        ? journey.targets.findIndex((target) => target.test(candidateText))
        : -1;
      let score = sharedTokens * 12;

      if (faq.categoryId === currentFaq.categoryId) score += 45;
      if (targetIndex >= 0) score += 120 - targetIndex * 18;
      if (selectedModel && faq.answer_type === "per_model") score += 20;

      return { faq, score, index };
    })
    .filter((item) => item && item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.faq);
}
