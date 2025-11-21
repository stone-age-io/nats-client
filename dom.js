export const els = {
  // Toasts
  toastContainer: document.getElementById("toast-container"),

  // Connection & Info
  url: document.getElementById("serverUrl"),
  urlHistory: document.getElementById("urlHistory"),
  creds: document.getElementById("credsFile"),
  authUser: document.getElementById("authUser"),
  authPass: document.getElementById("authPass"),
  authToken: document.getElementById("authToken"),
  btnConnect: document.getElementById("btnConnect"),
  statusText: document.getElementById("statusText"),
  statusDot: document.getElementById("statusDot"),
  rttLabel: document.getElementById("rttLabel"),
  btnInfo: document.getElementById("btnInfo"),
  
  // Modals
  infoModal: document.getElementById("infoModal"),
  btnCloseModal: document.getElementById("btnCloseModal"),
  serverInfoPre: document.getElementById("serverInfoPre"),
  configModal: document.getElementById("configModal"),
  configModalTitle: document.getElementById("configModalTitle"),
  btnCloseConfigModal: document.getElementById("btnCloseConfigModal"),
  configInput: document.getElementById("configInput"),
  btnConfigSave: document.getElementById("btnConfigSave"),
  
  // Panels
  subPanel: document.getElementById("subPanel"),
  appPanel: document.getElementById("appPanel"),
  subSubject: document.getElementById("subSubject"),
  btnSub: document.getElementById("btnSub"),
  subList: document.getElementById("subList"),
  subCount: document.getElementById("subCount"),
  subHistory: document.getElementById("subHistory"),
  
  // Tabs
  tabMsg: document.getElementById("tabMsg"),
  tabKv: document.getElementById("tabKv"),
  tabStream: document.getElementById("tabStream"),
  panelMsg: document.getElementById("panelMsg"),
  panelKv: document.getElementById("panelKv"),
  panelStream: document.getElementById("panelStream"),

  // Messaging
  pubSubject: document.getElementById("pubSubject"),
  pubPayload: document.getElementById("pubPayload"),
  btnHeaderToggle: document.getElementById("btnHeaderToggle"),
  headerContainer: document.getElementById("headerContainer"),
  pubHeaders: document.getElementById("pubHeaders"),
  reqTimeout: document.getElementById("reqTimeout"),
  btnPub: document.getElementById("btnPub"),
  btnReq: document.getElementById("btnReq"),
  messages: document.getElementById("messages"),
  logFilter: document.getElementById("logFilter"),
  btnPause: document.getElementById("btnPause"),
  btnClear: document.getElementById("btnClear"),

  // KV Store
  btnKvRefresh: document.getElementById("btnKvRefresh"),
  btnKvCreate: document.getElementById("btnKvCreate"),
  btnKvEdit: document.getElementById("btnKvEdit"),
  kvBucketSelect: document.getElementById("kvBucketSelect"),
  kvKeyList: document.getElementById("kvKeyList"),
  kvKeyInput: document.getElementById("kvKeyInput"),
  kvValueInput: document.getElementById("kvValueInput"),
  kvHistoryList: document.getElementById("kvHistoryList"),
  btnKvCopy: document.getElementById("btnKvCopy"),
  btnKvGet: document.getElementById("btnKvGet"),
  btnKvPut: document.getElementById("btnKvPut"),
  btnKvDelete: document.getElementById("btnKvDelete"),
  kvStatus: document.getElementById("kvStatus"),
  
  // Streams
  btnStreamCreate: document.getElementById("btnStreamCreate"),
  btnStreamRefresh: document.getElementById("btnStreamRefresh"),
  btnStreamEdit: document.getElementById("btnStreamEdit"),
  streamList: document.getElementById("streamList"),
  streamDetailView: document.getElementById("streamDetailView"),
  streamEmptyState: document.getElementById("streamEmptyState"),
  
  // Stream Details
  streamNameTitle: document.getElementById("streamNameTitle"),
  streamCreated: document.getElementById("streamCreated"),
  streamSubjects: document.getElementById("streamSubjects"),
  streamStorage: document.getElementById("streamStorage"),
  streamRetention: document.getElementById("streamRetention"),
  streamMsgs: document.getElementById("streamMsgs"),
  streamBytes: document.getElementById("streamBytes"),
  streamFirstSeq: document.getElementById("streamFirstSeq"),
  streamLastSeq: document.getElementById("streamLastSeq"),
  streamConsumerCount: document.getElementById("streamConsumerCount"),
  
  // Stream Actions
  btnStreamPurge: document.getElementById("btnStreamPurge"),
  btnStreamDelete: document.getElementById("btnStreamDelete"),
  
  // Consumers
  btnLoadConsumers: document.getElementById("btnLoadConsumers"),
  consumerList: document.getElementById("consumerList"),

  // Messages
  msgStartSeq: document.getElementById("msgStartSeq"), // NEW
  msgEndSeq: document.getElementById("msgEndSeq"), // NEW
  btnStreamViewMsgs: document.getElementById("btnStreamViewMsgs"),
  streamMsgContainer: document.getElementById("streamMsgContainer"),
};
