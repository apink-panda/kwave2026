const productShowcase = document.querySelector("#product-showcase");
const productModels = document.querySelectorAll("[data-product-model]");
const productSelectors = document.querySelectorAll("[data-product]");
const spinToggle = document.querySelector("#spin-toggle");
const spinLabel = document.querySelector("#spin-label");
const motionStatus = document.querySelector("#motion-status");
const titlePrefix = document.querySelector("#product-title-prefix");
const titleName = document.querySelector("#product-title-name");
const productIntro = document.querySelector("#product-intro");
const frontLabel = document.querySelector("#front-label");
const frontName = document.querySelector("#front-name");
const backLabel = document.querySelector("#back-label");
const backName = document.querySelector("#back-name");
const ticketNumber = document.querySelector("#ticket-number");
const ticketName = document.querySelector("#ticket-name");

let isPaused = false;
let activeProduct = "fan";

const products = {
  fan: {
    number: "01",
    titlePrefix: "夏日雙面",
    titleName: "圓形應援扇",
    intro: "將這次活動的夢幻晚霞與晴空海灘，收藏在一把輕巧的雙面應援扇上。",
    frontLabel: "正面",
    frontName: "夢幻晚霞",
    backLabel: "背面",
    backName: "晴空海灘",
    ticketName: "雙面圓形應援扇",
    showcaseLabel: "雙面圓形應援扇 360 度展示",
    motionStatus: "360° 自動旋轉",
    pauseLabel: "暫停旋轉",
    resumeLabel: "繼續旋轉",
    pauseAriaLabel: "暫停自動旋轉",
    resumeAriaLabel: "繼續自動旋轉",
  },
  keychain: {
    number: "02",
    titlePrefix: "雙款收藏",
    titleName: "壓克力鑰匙圈",
    intro: "白天晴空與夜晚晚霞各自成款，兩個圓形壓克力鑰匙圈一次展示、一起旋轉。",
    frontLabel: "夜晚版本",
    frontName: "夢幻晚霞",
    backLabel: "白天版本",
    backName: "晴空海灘",
    ticketName: "雙款壓克力鑰匙圈",
    showcaseLabel: "白天與夜晚雙款壓克力鑰匙圈一起旋轉展示",
    motionStatus: "雙款一起旋轉",
    pauseLabel: "暫停旋轉",
    resumeLabel: "繼續旋轉",
    pauseAriaLabel: "暫停自動旋轉",
    resumeAriaLabel: "繼續自動旋轉",
  },
  card: {
    number: "03",
    titlePrefix: "柔霧透光",
    titleName: "霧面應援透卡",
    intro: "將 Apink 與 Panda 的夏日舞台印在輕薄透卡上，柔霧表面在光線下留下細緻又夢幻的層次。",
    frontLabel: "正面",
    frontName: "APINK 與 PANDA",
    backLabel: "質感",
    backName: "霧面透光",
    ticketName: "霧面應援透卡",
    showcaseLabel: "霧面應援透卡上下浮動展示",
    motionStatus: "浮動展示",
    pauseLabel: "暫停浮動",
    resumeLabel: "繼續浮動",
    pauseAriaLabel: "暫停浮動展示",
    resumeAriaLabel: "繼續浮動展示",
  },
};

function setPaused(paused) {
  const product = products[activeProduct];

  isPaused = paused;
  document.querySelector(`[data-product-model="${activeProduct}"]`).classList.toggle("is-paused", isPaused);
  spinToggle.setAttribute("aria-pressed", String(isPaused));
  spinToggle.setAttribute("aria-label", isPaused ? product.resumeAriaLabel : product.pauseAriaLabel);
  spinLabel.textContent = isPaused ? product.resumeLabel : product.pauseLabel;
}

function showProduct(productId) {
  const product = products[productId];

  if (!product) {
    return;
  }

  activeProduct = productId;

  productModels.forEach((model) => {
    const isActive = model.dataset.productModel === productId;
    model.hidden = !isActive;
    model.classList.toggle("is-active", isActive);
    model.classList.remove("is-paused");
  });

  productSelectors.forEach((selector) => {
    const isActive = selector.dataset.product === productId;
    selector.classList.toggle("is-active", isActive);

    if (selector.getAttribute("role") === "tab") {
      selector.setAttribute("aria-selected", String(isActive));
    } else {
      selector.setAttribute("aria-current", String(isActive));
    }
  });

  titlePrefix.textContent = product.titlePrefix;
  titleName.textContent = product.titleName;
  productIntro.textContent = product.intro;
  frontLabel.textContent = product.frontLabel;
  frontName.textContent = product.frontName;
  backLabel.textContent = product.backLabel;
  backName.textContent = product.backName;
  ticketNumber.textContent = product.number;
  ticketName.textContent = product.ticketName;
  motionStatus.textContent = product.motionStatus;
  productShowcase.setAttribute("aria-label", product.showcaseLabel);
  productShowcase.classList.toggle("is-keychain", productId === "keychain");
  productShowcase.classList.toggle("is-card", productId === "card");

  setPaused(false);
}

productSelectors.forEach((selector) => {
  selector.addEventListener("click", () => {
    showProduct(selector.dataset.product);
  });
});

spinToggle.addEventListener("click", () => {
  setPaused(!isPaused);
});
