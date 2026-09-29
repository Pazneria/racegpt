import { clamp, shortestAngleDelta } from "../core/math";
import type { InputSnapshot } from "../input/InputManager";
import type { Car, CarTelemetry } from "./Car";
import type { Track } from "./Track";

const TRACK_B_DRIVER = {
  lookBase: -34.7332350679487,
  lookScale: 6.188902682252229,
  lookMin: 74.63539568817244,
  lookMax: 90.63539568817244,
  curveLook: 144.0512598251961,
  steerGain: 9.658410271782433,
  lateralGain: 0.06180205124037339,
  feedForward: -0.2353091283820569,
  baseLateral: 0.19660935018584097,
  turnLateral: -2.644351000647992,
  curveLateral: -4.511822592496874,
  throttle: 0.9855863426313733,
  brakeSpeed: 95.86729394586756,
  brakeAmount: 0.15592443394241853,
  brakeCurve: 0.9063966620147228
};

interface TrackDSearchSector {
  endRatio: number;
  lookBase: number;
  lookScale: number;
  lookMin: number;
  lookMax: number;
  curveLook: number;
  steerGain: number;
  lateralGain: number;
  feedForward: number;
  baseLateral: number;
  turnLateral: number;
  curveLateral: number;
  throttle: number;
  brakeSpeed: number;
  brakeAmount: number;
  brakeCurve: number;
  curveDiv: number;
  latClamp: number;
}

interface TrackDRampOverlay {
  steerSmooth: number;
  rampBrakeStartS: number;
  rampBrakeEndS: number;
  rampBrake: number;
  rampThrottleStartS: number;
  rampThrottleEndS: number;
  rampThrottle: number;
  airSteerScale: number;
  landingLateralBias: number;
  landingFeedForward: number;
}

interface TrackDSearchPolicy {
  edgeBrake?: number;
  edgeBrakeMargin?: number;
  edgeBrakeSpeed?: number;
  ramp?: TrackDRampOverlay;
  sectors: TrackDSearchSector[];
}

interface TrackCSearchSector {
  endS: number;
  lookBase: number;
  lookScale: number;
  lookMin: number;
  lookMax: number;
  curveLook: number;
  steerGain: number;
  lateralGain: number;
  feedForward: number;
  baseLateral: number;
  turnLateral: number;
  curveLateral: number;
  throttle: number;
  brakeSpeed: number;
  brakeAmount: number;
  brakeCurve: number;
  curveDiv: number;
  latClamp: number;
}

interface TrackCSearchPolicy {
  sectors: TrackCSearchSector[];
}

const TRACK_D_SEARCH_STATE = new WeakMap<Car, { steer: number }>();

export function resetAutopilotState(car: Car): void {
  TRACK_D_SEARCH_STATE.delete(car);
}

const TRACK_D_GAP_END_S = 796.6981333580593;
const TRACK_D_DEFAULT_RAMP: TrackDRampOverlay = {
  steerSmooth: 1,
  rampBrakeStartS: 720,
  rampBrakeEndS: 720,
  rampBrake: 0,
  rampThrottleStartS: 720,
  rampThrottleEndS: 720,
  rampThrottle: 1,
  airSteerScale: 1,
  landingLateralBias: 0,
  landingFeedForward: 0
};

const TRACK_C_DRIVER = {
  split1: 1676.818208738072,
  split2: 3010.23197456696,
  split3: 3600.1054152950824,
  sectors: {
    start: {
      lookBase: 14.141006682822788,
      lookScale: 0.8339823655900572,
      lookMin: 55.56322676950339,
      lookMax: 112.22567047815387,
      curveLook: 171.76072948415126,
      steerGain: 5.904656696912638,
      lateralGain: 0.04054387999867911,
      feedForward: -0.15022539761091594,
      baseLateral: 1.132045064104493,
      turnLateral: -2.568300855046658,
      curveLateral: -5.831235969041437,
      throttle: 0.997745620973729,
      brakeSpeed: 80.5195017000455,
      brakeAmount: 0.5149671834582765,
      brakeCurve: 0.7145700962930196,
      curveDiv: 1.5215464276466877,
      latClamp: 8.661341248504867
    },
    middle: {
      lookBase: 9.80799100537396,
      lookScale: 1.0464105497324894,
      lookMin: 62.067305028945306,
      lookMax: 138.30449505164444,
      curveLook: 186.1834404146536,
      steerGain: 5.826447392322659,
      lateralGain: 0.057530302745767925,
      feedForward: 0.04335082037241125,
      baseLateral: 1.776367421899096,
      turnLateral: -0.8799535015776946,
      curveLateral: -4.343004083071295,
      throttle: 0.9996911146303104,
      brakeSpeed: 106.29867903715846,
      brakeAmount: 0.4709787326603551,
      brakeCurve: 0.7864750761965253,
      curveDiv: 1.6067417549970515,
      latClamp: 8.26978851977656
    },
    late: {
      lookBase: 11.704694861844333,
      lookScale: 0.8379466718355401,
      lookMin: 53.11368639504169,
      lookMax: 115.71479183162482,
      curveLook: 165.56222794933583,
      steerGain: 6.077398581538224,
      lateralGain: 0.04744046170412082,
      feedForward: -0.09201819405158054,
      baseLateral: 0.7732297264786089,
      turnLateral: -2.4634607197827605,
      curveLateral: -5.170612297439843,
      throttle: 0.9886673775391843,
      brakeSpeed: 87.78597718659579,
      brakeAmount: 0.6292958915930176,
      brakeCurve: 0.7054068010051296,
      curveDiv: 1.5061117714368053,
      latClamp: 8.034345247206623
    },
    finish: {
      lookBase: 11.500608106930704,
      lookScale: 0.8689921272336969,
      lookMin: 52.78446825855297,
      lookMax: 115.07445399848861,
      curveLook: 161.33241744919573,
      steerGain: 5.983005278881262,
      lateralGain: 0.047361948411057224,
      feedForward: -0.14070662638579726,
      baseLateral: 0.5750058228041562,
      turnLateral: -2.15525954586077,
      curveLateral: -4.998242351148615,
      throttle: 0.9890848080482791,
      brakeSpeed: 93.81259988300636,
      brakeAmount: 0.6295564097082952,
      brakeCurve: 0.7446019274746966,
      curveDiv: 1.5229166707363284,
      latClamp: 8.045922097316975
    }
  }
};

const TRACK_C_SEARCH_51233: TrackCSearchPolicy = {
  sectors: [
    {
      endS: 650,
      lookBase: 13.490419834991306,
      lookScale: 0.538573436620259,
      lookMin: 65.48193535737725,
      lookMax: 96.61350732262324,
      curveLook: 158.12927509491462,
      steerGain: 6.436330361527484,
      lateralGain: 0.040180751908924374,
      feedForward: -0.057117029435185505,
      baseLateral: 1.2186612471898806,
      turnLateral: -1.1017634941918255,
      curveLateral: 0.3540724956610689,
      throttle: 1,
      brakeSpeed: 72.66967887581725,
      brakeAmount: 0.45260935912205147,
      brakeCurve: 0.6446423578488122,
      curveDiv: 1.4766013116776406,
      latClamp: 6.0654401867487975
    },
    {
      endS: 1200,
      lookBase: 15.46230810597439,
      lookScale: 1.2100592267927184,
      lookMin: 59.47682510213522,
      lookMax: 103.4590362617108,
      curveLook: 153.19085157475564,
      steerGain: 5.112218624586957,
      lateralGain: 0.030905713414469654,
      feedForward: 0.0052950941033130736,
      baseLateral: 1.5497197403120258,
      turnLateral: -2.862616662210081,
      curveLateral: -4.535485427844401,
      throttle: 1,
      brakeSpeed: 81.90295835282168,
      brakeAmount: 0.4320034341910554,
      brakeCurve: 0.6454996710721881,
      curveDiv: 1.4296987233904845,
      latClamp: 9.429323711210182
    },
    {
      endS: 1543.979571,
      lookBase: 14.141006682822788,
      lookScale: 0.8339823655900572,
      lookMin: 55.56322676950339,
      lookMax: 112.22567047815387,
      curveLook: 171.76072948415126,
      steerGain: 5.904656696912638,
      lateralGain: 0.04054387999867911,
      feedForward: -0.15022539761091594,
      baseLateral: 1.132045064104493,
      turnLateral: -2.568300855046658,
      curveLateral: -5.831235969041437,
      throttle: 0.997745620973729,
      brakeSpeed: 80.5195017000455,
      brakeAmount: 0.5149671834582765,
      brakeCurve: 0.7145700962930196,
      curveDiv: 1.5215464276466877,
      latClamp: 8.661341248504867
    },
    {
      endS: 1676.818209,
      lookBase: 36.13406711645424,
      lookScale: 0.5914041501160043,
      lookMin: 77.16905967268394,
      lookMax: 102.55840862982542,
      curveLook: 212.64230357619255,
      steerGain: 5.016418996039889,
      lateralGain: 0.005,
      feedForward: -0.3115743982919215,
      baseLateral: 7.023414683185552,
      turnLateral: -5.009144704585732,
      curveLateral: -5.386483840503176,
      throttle: 1,
      brakeSpeed: 49.470593639169415,
      brakeAmount: 0.6436428918072705,
      brakeCurve: 0.7233190538490829,
      curveDiv: 1.8425669140646563,
      latClamp: 7.415455719164142
    },
    {
      endS: 2100,
      lookBase: 12.646302938509523,
      lookScale: 0.8173591855149019,
      lookMin: 79.53440129881179,
      lookMax: 142.8875815331813,
      curveLook: 169.4719506284625,
      steerGain: 5.447502412683141,
      lateralGain: 0.0066789317092717446,
      feedForward: 0.000957614146680108,
      baseLateral: 3.846697366015124,
      turnLateral: -0.6729882693336142,
      curveLateral: -3.7006921845991547,
      throttle: 1,
      brakeSpeed: 113.55551825100694,
      brakeAmount: 0.7290392787790821,
      brakeCurve: 0.8686828217814552,
      curveDiv: 1.5323211661450555,
      latClamp: 8.384008061073864
    },
    {
      endS: 2700,
      lookBase: 7.932167602760559,
      lookScale: 0.9053002003997772,
      lookMin: 73.4751214285027,
      lookMax: 117.55648218444068,
      curveLook: 188.70625435671076,
      steerGain: 6.399490399460867,
      lateralGain: 0.059787080995489905,
      feedForward: 0.19751881040966351,
      baseLateral: -1.2395250041388568,
      turnLateral: 2.741818309129783,
      curveLateral: -1.8032953193435683,
      throttle: 1,
      brakeSpeed: 105.26865960766096,
      brakeAmount: 0.72,
      brakeCurve: 0.8523266866965448,
      curveDiv: 1.3796632244102016,
      latClamp: 9.656210622519193
    },
    {
      endS: 3010.231975,
      lookBase: 3.324456900105508,
      lookScale: 0.9272752060042843,
      lookMin: 69.28626152646603,
      lookMax: 125.74697378465594,
      curveLook: 192.53835216396385,
      steerGain: 6.489144193687805,
      lateralGain: 0.07272402292537195,
      feedForward: 0.23627388915758782,
      baseLateral: 2.239693161660842,
      turnLateral: 1.1291770680764714,
      curveLateral: -6.386670880524871,
      throttle: 1,
      brakeSpeed: 105.91964450311313,
      brakeAmount: 0.2643776373908428,
      brakeCurve: 0.8732886962663194,
      curveDiv: 1.749852675543404,
      latClamp: 6.724615921855462
    },
    {
      endS: 3176.186545,
      lookBase: 11.704694861844333,
      lookScale: 0.8379466718355401,
      lookMin: 53.11368639504169,
      lookMax: 115.71479183162482,
      curveLook: 165.56222794933583,
      steerGain: 6.077398581538224,
      lateralGain: 0.04744046170412082,
      feedForward: -0.09201819405158054,
      baseLateral: 0.7732297264786089,
      turnLateral: -2.4634607197827605,
      curveLateral: -5.170612297439843,
      throttle: 0.9886673775391843,
      brakeSpeed: 87.78597718659579,
      brakeAmount: 0.6292958915930176,
      brakeCurve: 0.7054068010051296,
      curveDiv: 1.5061117714368053,
      latClamp: 8.034345247206623
    },
    {
      endS: 3600,
      lookBase: 5.335511568565125,
      lookScale: 0.8937428564309329,
      lookMin: 50.894510862468394,
      lookMax: 124.30549626591991,
      curveLook: 161.5632127505763,
      steerGain: 5.954636843164739,
      lateralGain: 0.02113139561105024,
      feedForward: -0.1305257782016878,
      baseLateral: 2.4680588023623167,
      turnLateral: -2.195013604843247,
      curveLateral: -5.058501511303322,
      throttle: 0.9787736211468896,
      brakeSpeed: 88.00078024665417,
      brakeAmount: 0.7174736566058997,
      brakeCurve: 0.6721384194667738,
      curveDiv: 1.6545416456051585,
      latClamp: 8.289758817262015
    },
    {
      endS: 3600.105415,
      lookBase: 15.343859060486396,
      lookScale: 0.4519242806309326,
      lookMin: 37.30877936640801,
      lookMax: 110.57393612857541,
      curveLook: 87.96538783264594,
      steerGain: 3.629277395338903,
      lateralGain: 0.08215680104262404,
      feedForward: -0.19909256498781963,
      baseLateral: -1.6981489178663944,
      turnLateral: -8.830715811678814,
      curveLateral: -0.6801318310995177,
      throttle: 0.9861370502512785,
      brakeSpeed: 75.04088328942049,
      brakeAmount: 0.7179420351102913,
      brakeCurve: 0.8136104131228893,
      curveDiv: 1.2196533800716878,
      latClamp: 11.863131757550072
    },
    {
      endS: 4402.370202,
      lookBase: 42.61110374821778,
      lookScale: 0.6924465316597654,
      lookMin: 94.78545966279397,
      lookMax: 41.16873436280045,
      curveLook: 192.86333514367237,
      steerGain: 9.257471226836346,
      lateralGain: 0.068839531609577,
      feedForward: -0.95,
      baseLateral: 10.255027113185943,
      turnLateral: -7.287877352510014,
      curveLateral: -16.77931891708912,
      throttle: 0.985,
      brakeSpeed: 105.31488278717006,
      brakeAmount: 0.72,
      brakeCurve: 0.15131914868288612,
      curveDiv: 2.1009113716882095,
      latClamp: 5.760034935607536
    }
  ]
};

export function getAutopilotInput(
  base: InputSnapshot,
  car: Car,
  track: Track,
  telemetry: CarTelemetry,
  variant = "codex"
): InputSnapshot {
  if (track.id === "test-track-b") {
    return getTrackBInput(base, car, track, telemetry);
  }
  if (track.id === "technical-bowl") {
    if (variant === "search-51233") {
      return getTrackCSearchInput(base, car, track, telemetry, TRACK_C_SEARCH_51233);
    }
    return getTrackCInput(base, car, track, telemetry);
  }
  if (track.id === "jump-speedcheck") {
    if (variant === "search-37250") {
      return getTrackDSearchInput(base, car, track, telemetry, TRACK_D_SEARCH_37250);
    }
    if (variant === "search-37275") {
      return getTrackDSearchInput(base, car, track, telemetry, TRACK_D_SEARCH_37275);
    }
    if (variant === "search-37283") {
      return getTrackDSearchInput(base, car, track, telemetry, TRACK_D_SEARCH_37283);
    }
    if (variant === "search-37425") {
      return getTrackDSearchInput(base, car, track, telemetry, TRACK_D_SEARCH_37425);
    }
    if (variant === "search-37525") {
      return getTrackDSearchInput(base, car, track, telemetry, TRACK_D_SEARCH_37525);
    }
    if (variant === "search-37825") {
      return getTrackDSearchInput(base, car, track, telemetry, TRACK_D_SEARCH_37825);
    }
    return getTrackDInput(base, car, track, telemetry);
  }

  const contact = car.getContact(track);
  const lookAhead = clamp(11.779 + telemetry.speedMps * 4.198, 14, 77.308);
  const target = track.getSampleAtS(contact.s + lookAhead);
  const curveTarget = track.getSampleAtS(contact.s + 190.071);
  const currentYaw = Math.atan2(contact.sample.tangent.x, contact.sample.tangent.z);
  const curveYaw = Math.atan2(curveTarget.tangent.x, curveTarget.tangent.z);
  const turnSign = Math.sign(shortestAngleDelta(currentYaw, curveYaw));
  const targetLateral = -1.694 * turnSign;
  const toTarget = target.center
    .clone()
    .addScaledVector(target.side, targetLateral)
    .sub(car.position);
  const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
  const headingError = shortestAngleDelta(car.yaw, desiredYaw);
  const steer = clamp(
    headingError * 4.607 + (targetLateral - contact.lateral) * 0.0382 - turnSign * 0.1757,
    -1,
    1
  );

  return {
    ...base,
    steer,
    throttle: 1,
    brake: 0,
    checkpointResetPressed: false,
    fullRestartPressed: false,
    pausePressed: false,
    confirmPressed: false
  };
}

const TRACK_D_SEARCH_37825 = {
  sectors: [
    {
      endRatio: 0.34,
      lookBase: 7.107262843216419,
      lookScale: 4.406834513337984,
      lookMin: 60.202375956440555,
      lookMax: 139.28991524223363,
      curveLook: 52.11413295910782,
      steerGain: 7.082341929592428,
      lateralGain: 0.04380982199757235,
      feedForward: 0.12196818817399928,
      baseLateral: 2.1363003548285078,
      turnLateral: -5.010139185006432,
      curveLateral: 1.9123084580593597,
      throttle: 1,
      brakeSpeed: 91.64579265518162,
      brakeAmount: 0.1499481581236106,
      brakeCurve: 0.5269559502881515,
      curveDiv: 1.223582473805858,
      latClamp: 10.521519574431096
    },
    {
      endRatio: 0.68,
      lookBase: 28.72237033675767,
      lookScale: 1.3075653439589325,
      lookMin: 119.45244696686112,
      lookMax: 70.49125147510144,
      curveLook: 223.22749039486195,
      steerGain: 10.46416407195339,
      lateralGain: 0.15056167154477484,
      feedForward: -0.5086133339949578,
      baseLateral: 3.7747595882994456,
      turnLateral: 5.09146020929024,
      curveLateral: -1.8711686875892668,
      throttle: 0.9720164441491144,
      brakeSpeed: 57.83004126979321,
      brakeAmount: 0.23450616317068237,
      brakeCurve: 0.8196766018175972,
      curveDiv: 2.3720333501244997,
      latClamp: 13.3290198780193
    },
    {
      endRatio: 1,
      lookBase: -15.19550744022597,
      lookScale: 1.7460678795671523,
      lookMin: 49.323471917394414,
      lookMax: 128.14953857337125,
      curveLook: 82.50212407761182,
      steerGain: 11.645703226756115,
      lateralGain: 0.05862747960514715,
      feedForward: 0.018898859958566223,
      baseLateral: -0.38478270793578584,
      turnLateral: 0.4005211966090967,
      curveLateral: -11.935531237766275,
      throttle: 0.9961757022038504,
      brakeSpeed: 80.03850095735287,
      brakeAmount: 0.8238310163578559,
      brakeCurve: 0.8603413445722647,
      curveDiv: 2.2739702790919862,
      latClamp: 7.352977215291615
    }
  ]
};

const TRACK_D_SEARCH_37525 = {
  sectors: [
    {
      endRatio: 0.33403114784182986,
      lookBase: 11.1780004158268,
      lookScale: 5.2176122024521945,
      lookMin: 82.0135575734472,
      lookMax: 138.56711709313217,
      curveLook: 44.72565636299551,
      steerGain: 7.819169202879307,
      lateralGain: 0.06519483619927305,
      feedForward: -0.01304088315523679,
      baseLateral: 3.5021949230138296,
      turnLateral: -3.166217916833871,
      curveLateral: 1.2896512240704932,
      throttle: 0.9950672381248324,
      brakeSpeed: 72.80708104408394,
      brakeAmount: 0.20141953493664044,
      brakeCurve: 0.6503283421199795,
      curveDiv: 1.1896434660313968,
      latClamp: 11.4234825620254
    },
    {
      endRatio: 0.6626830421285703,
      lookBase: 27.152137394206296,
      lookScale: 2.0773787829444292,
      lookMin: 127.54562572421572,
      lookMax: 57.413662572110155,
      curveLook: 233.94485110763603,
      steerGain: 10.705748968115543,
      lateralGain: 0.13422983959286983,
      feedForward: -0.581848873315069,
      baseLateral: 6.76207470582997,
      turnLateral: 3.117563675406132,
      curveLateral: -5.153195135503808,
      throttle: 0.991717958902255,
      brakeSpeed: 57.00208287217937,
      brakeAmount: 0.24409579238354245,
      brakeCurve: 0.6189319375778998,
      curveDiv: 2.509421949108141,
      latClamp: 9.800324986820762
    },
    {
      endRatio: 1,
      lookBase: -7.239908039377818,
      lookScale: 2.049027440881586,
      lookMin: 37.0536884072012,
      lookMax: 143.2004832093511,
      curveLook: 79.87036951814707,
      steerGain: 10.423917856667002,
      lateralGain: 0.057481977826639545,
      feedForward: 0.11896157396978833,
      baseLateral: 0.4960311128454003,
      turnLateral: -1.4544893335572315,
      curveLateral: -14.709134153973439,
      throttle: 0.9993760259453207,
      brakeSpeed: 68.2187330944406,
      brakeAmount: 0.7299462567563709,
      brakeCurve: 0.7724699680035806,
      curveDiv: 2.298144565072859,
      latClamp: 6.685514244961237
    }
  ]
};

const TRACK_D_SEARCH_37425 = {
  sectors: [
    {
      endRatio: 0.3289423331630379,
      lookBase: 10.662787108108954,
      lookScale: 5.226252817551378,
      lookMin: 82.0135575734472,
      lookMax: 138.56711709313217,
      curveLook: 47.53449896138915,
      steerGain: 8.103605504318542,
      lateralGain: 0.06875049954337417,
      feedForward: -0.03298834278478675,
      baseLateral: 3.5644969913020277,
      turnLateral: -2.9220058103092867,
      curveLateral: 1.2896512240704932,
      throttle: 1,
      brakeSpeed: 72.80708104408394,
      brakeAmount: 0.20141953493664044,
      brakeCurve: 0.6463008313391095,
      curveDiv: 1.2653315530242193,
      latClamp: 11.280302413946453
    },
    {
      endRatio: 0.662854301539888,
      lookBase: 27.152137394206296,
      lookScale: 2.1688573163194675,
      lookMin: 127.93273745712233,
      lookMax: 56.52443693136896,
      curveLook: 242.90233262723453,
      steerGain: 10.900933124016944,
      lateralGain: 0.13677887469199468,
      feedForward: -0.5685503106992363,
      baseLateral: 7.119962250206826,
      turnLateral: 2.7802618060088817,
      curveLateral: -5.565506952651209,
      throttle: 0.9998865054644815,
      brakeSpeed: 56.80937060851292,
      brakeAmount: 0.2688354991168115,
      brakeCurve: 0.6295641765299975,
      curveDiv: 2.5021910153320297,
      latClamp: 9.800324986820762
    },
    {
      endRatio: 1,
      lookBase: -5.570149399430182,
      lookScale: 1.9070289309725583,
      lookMin: 37.0536884072012,
      lookMax: 144.21128367629913,
      curveLook: 83.691332290035,
      steerGain: 10.09395009993301,
      lateralGain: 0.053154919295061574,
      feedForward: 0.12035278331523423,
      baseLateral: 0.4886736920503413,
      turnLateral: -1.3255390819497126,
      curveLateral: -14.253429008034841,
      throttle: 0.9993760259453207,
      brakeSpeed: 67.99842473656216,
      brakeAmount: 0.7225205355780118,
      brakeCurve: 0.7529443686898677,
      curveDiv: 2.3192601192583475,
      latClamp: 6.399428072088211
    }
  ]
};

const TRACK_D_SEARCH_37283 = {
  edgeBrake: 0,
  edgeBrakeMargin: 2.532202013217808,
  edgeBrakeSpeed: 30,
  sectors: [
    {
      endRatio: 0.32381658017657056,
      lookBase: 12.763306330924935,
      lookScale: 5.45689810893283,
      lookMin: 76.97037080426519,
      lookMax: 129.63193658865146,
      curveLook: 46.274569332543976,
      steerGain: 8.014596036603836,
      lateralGain: 0.08610221920025296,
      feedForward: -0.04829498275271653,
      baseLateral: 4.251880508461978,
      turnLateral: -1.9573330655026415,
      curveLateral: 0.4319152064437367,
      throttle: 1,
      brakeSpeed: 100.17485590420874,
      brakeAmount: 0.35813722838935985,
      brakeCurve: 0.5571786056432789,
      curveDiv: 1.4453499947775117,
      latClamp: 12.302042377859799
    },
    {
      endRatio: 0.6626830421285703,
      lookBase: 27.442477642684405,
      lookScale: 2.2687193889059345,
      lookMin: 130.6704645739665,
      lookMax: 55.915929191724516,
      curveLook: 270,
      steerGain: 9.293792063887235,
      lateralGain: 0.07763739414793712,
      feedForward: -0.3374934192932945,
      baseLateral: 8,
      turnLateral: 3.434174717585309,
      curveLateral: -12.174541720391682,
      throttle: 1,
      brakeSpeed: 58.87217493314176,
      brakeAmount: 0.1973185274844473,
      brakeCurve: 0.5723737595425604,
      curveDiv: 2.8463748147485455,
      latClamp: 9.957534098455683
    },
    {
      endRatio: 1,
      lookBase: -18.90392106027999,
      lookScale: 2.6142870209585647,
      lookMin: 36,
      lookMax: 142.31313502139466,
      curveLook: 89.3140082717534,
      steerGain: 12.360422128719446,
      lateralGain: 0.05803753489573665,
      feedForward: 0.09779356370244521,
      baseLateral: 2.065271053749187,
      turnLateral: -0.39229048839780406,
      curveLateral: -10.21950977296614,
      throttle: 1,
      brakeSpeed: 130.1654986155082,
      brakeAmount: 0.03478789924076349,
      brakeCurve: 1.043891830561988,
      curveDiv: 2.240943448442041,
      latClamp: 6.962308492090155
    }
  ]
};

const TRACK_D_SEARCH_37275: TrackDSearchPolicy = {
  edgeBrake: 0,
  edgeBrakeMargin: 2.532202013217808,
  edgeBrakeSpeed: 30,
  sectors: [
    {
      endRatio: 0.3233670996333538,
      lookBase: 13.468790755007705,
      lookScale: 5.793906293754167,
      lookMin: 77.2309096851817,
      lookMax: 129.75319834246125,
      curveLook: 48.985571985471154,
      steerGain: 7.942004226397135,
      lateralGain: 0.08768020565710824,
      feedForward: -0.03600441209779941,
      baseLateral: 4.36414938816539,
      turnLateral: -2.0359044538286803,
      curveLateral: 0.15954876812644747,
      throttle: 1,
      brakeSpeed: 100.17485590420874,
      brakeAmount: 0.35813722838935985,
      brakeCurve: 0.5571786056432789,
      curveDiv: 1.4453499947775117,
      latClamp: 12.302042377859799
    },
    {
      endRatio: 0.662110061864951,
      lookBase: 28.170011734186836,
      lookScale: 2.2584399176068306,
      lookMin: 130.9877314546332,
      lookMax: 55.46010622087897,
      curveLook: 271.1164639989811,
      steerGain: 9.303689719066623,
      lateralGain: 0.07654193685023858,
      feedForward: -0.3488253684330957,
      baseLateral: 8.107691080035687,
      turnLateral: 3.434582369685211,
      curveLateral: -12.340450373502643,
      throttle: 1,
      brakeSpeed: 58.79248146835853,
      brakeAmount: 0.20299928033860007,
      brakeCurve: 0.5756521121855476,
      curveDiv: 2.8490074955202944,
      latClamp: 9.979015255903485
    },
    {
      endRatio: 1,
      lookBase: -19.109278292637306,
      lookScale: 2.5842047447331877,
      lookMin: 36.103925376573805,
      lookMax: 143.07741939500184,
      curveLook: 90.312048086181,
      steerGain: 12.377603947098054,
      lateralGain: 0.056135674451459755,
      feedForward: 0.10155566170559234,
      baseLateral: 1.9670698166501466,
      turnLateral: -0.21158588178809387,
      curveLateral: -10.117263932661421,
      throttle: 1,
      brakeSpeed: 130.40167479413643,
      brakeAmount: 0.043550302555020154,
      brakeCurve: 1.0445401747095067,
      curveDiv: 2.240354208515638,
      latClamp: 7.008630165985987
    }
  ],
  ramp: {
    steerSmooth: 0.9579175964579735,
    rampBrakeStartS: 720,
    rampBrakeEndS: 720,
    rampBrake: 0.028947111864500653,
    rampThrottleStartS: 720,
    rampThrottleEndS: 720,
    rampThrottle: 1,
    airSteerScale: 1.023820093137956,
    landingLateralBias: -0.052076164781390946,
    landingFeedForward: -0.0324836947012832
  }
};

const TRACK_D_SEARCH_37250: TrackDSearchPolicy = {
  edgeBrake: 0,
  edgeBrakeMargin: 2.532202013217808,
  edgeBrakeSpeed: 29.967740304033054,
  sectors: [
    {
      endRatio: 0.3149139152176178,
      lookBase: 11.619839650520914,
      lookScale: 5.40273135179659,
      lookMin: 81.18503664268661,
      lookMax: 139.59694418947473,
      curveLook: 46.59183690775453,
      steerGain: 8.080324022177802,
      lateralGain: 0.09062639110189943,
      feedForward: -0.020608211817405495,
      baseLateral: 4.628548261306365,
      turnLateral: -2.133685919068597,
      curveLateral: 0.7772444376947648,
      throttle: 1,
      brakeSpeed: 97.47443086885987,
      brakeAmount: 0.2524147344437507,
      brakeCurve: 0.5475725817668456,
      curveDiv: 1.5027396001648659,
      latClamp: 12.759215269148969
    },
    {
      endRatio: 0.6626830421285703,
      lookBase: 29.52514543552522,
      lookScale: 2.1651191959336,
      lookMin: 130.02942263646742,
      lookMax: 57.895321593675455,
      curveLook: 267.084563671575,
      steerGain: 9.773627093925054,
      lateralGain: 0.07104024562504035,
      feedForward: -0.39711456800533196,
      baseLateral: 8.150993598333994,
      turnLateral: 3.0127900208667318,
      curveLateral: -12.349471618804484,
      throttle: 1,
      brakeSpeed: 53.813815173530934,
      brakeAmount: 0.18892480414799934,
      brakeCurve: 0.566596313685826,
      curveDiv: 2.8208362280339063,
      latClamp: 9.641542514569192
    },
    {
      endRatio: 1,
      lookBase: -18.23721690560048,
      lookScale: 2.5558989217430392,
      lookMin: 38.04388152943098,
      lookMax: 140.3220731225942,
      curveLook: 89.20436987600628,
      steerGain: 11.759056727260136,
      lateralGain: 0.05071397021890086,
      feedForward: 0.08372484121467717,
      baseLateral: 2.1800883535117626,
      turnLateral: -0.01911238833998108,
      curveLateral: -10.037343482584957,
      throttle: 1,
      brakeSpeed: 127.25648055581412,
      brakeAmount: 0.083771686296964,
      brakeCurve: 1.0523636931408402,
      curveDiv: 2.2070989973851156,
      latClamp: 7.112778719492411
    }
  ]
};

function getTrackBInput(
  base: InputSnapshot,
  car: Car,
  track: Track,
  telemetry: CarTelemetry
): InputSnapshot {
  const contact = car.getContact(track);
  const lookAhead = clamp(
    TRACK_B_DRIVER.lookBase + telemetry.speedMps * TRACK_B_DRIVER.lookScale,
    TRACK_B_DRIVER.lookMin,
    TRACK_B_DRIVER.lookMax
  );
  const target = track.getSampleAtS(contact.s + lookAhead);
  const curveTarget = track.getSampleAtS(contact.s + TRACK_B_DRIVER.curveLook);
  const currentYaw = Math.atan2(contact.sample.tangent.x, contact.sample.tangent.z);
  const curveYaw = Math.atan2(curveTarget.tangent.x, curveTarget.tangent.z);
  const curveDelta = shortestAngleDelta(currentYaw, curveYaw);
  const turnSign = Math.sign(curveDelta);
  const curveAmount = Math.min(1, Math.abs(curveDelta) / 1.1);
  const targetLateral = clamp(
    TRACK_B_DRIVER.baseLateral +
      turnSign * (TRACK_B_DRIVER.turnLateral + TRACK_B_DRIVER.curveLateral * curveAmount),
    -8.8,
    8.8
  );
  const toTarget = target.center
    .clone()
    .addScaledVector(target.side, targetLateral)
    .sub(car.position);
  const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
  const headingError = shortestAngleDelta(car.yaw, desiredYaw);
  const steer = clamp(
    headingError * TRACK_B_DRIVER.steerGain +
      (targetLateral - contact.lateral) * TRACK_B_DRIVER.lateralGain +
      turnSign * TRACK_B_DRIVER.feedForward,
    -1,
    1
  );
  const brake =
    telemetry.speedMps > TRACK_B_DRIVER.brakeSpeed && curveAmount > TRACK_B_DRIVER.brakeCurve
      ? TRACK_B_DRIVER.brakeAmount * curveAmount
      : 0;

  return {
    ...base,
    steer,
    throttle: TRACK_B_DRIVER.throttle,
    brake,
    checkpointResetPressed: false,
    fullRestartPressed: false,
    pausePressed: false,
    confirmPressed: false
  };
}

function getTrackCInput(
  base: InputSnapshot,
  car: Car,
  track: Track,
  telemetry: CarTelemetry
): InputSnapshot {
  const contact = car.getContact(track);
  const driver = getTrackCDriver(contact.s);
  const lookAhead = clamp(
    driver.lookBase + telemetry.speedMps * driver.lookScale,
    driver.lookMin,
    driver.lookMax
  );
  const target = track.getSampleAtS(contact.s + lookAhead);
  const curveTarget = track.getSampleAtS(contact.s + driver.curveLook);
  const currentYaw = Math.atan2(contact.sample.tangent.x, contact.sample.tangent.z);
  const curveYaw = Math.atan2(curveTarget.tangent.x, curveTarget.tangent.z);
  const curveDelta = shortestAngleDelta(currentYaw, curveYaw);
  const turnSign = Math.sign(curveDelta);
  const curveAmount = Math.min(1, Math.abs(curveDelta) / driver.curveDiv);
  const targetLateral = clamp(
    driver.baseLateral + turnSign * (driver.turnLateral + driver.curveLateral * curveAmount),
    -driver.latClamp,
    driver.latClamp
  );
  const toTarget = target.center
    .clone()
    .addScaledVector(target.side, targetLateral)
    .sub(car.position);
  const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
  const headingError = shortestAngleDelta(car.yaw, desiredYaw);
  const steer = clamp(
    headingError * driver.steerGain +
      (targetLateral - contact.lateral) * driver.lateralGain +
      turnSign * driver.feedForward,
    -1,
    1
  );
  const brake =
    telemetry.speedMps > driver.brakeSpeed && curveAmount > driver.brakeCurve
      ? driver.brakeAmount * curveAmount
      : 0;

  return {
    ...base,
    steer,
    throttle: driver.throttle,
    brake,
    checkpointResetPressed: false,
    fullRestartPressed: false,
    pausePressed: false,
    confirmPressed: false
  };
}

function getTrackCSearchInput(
  base: InputSnapshot,
  car: Car,
  track: Track,
  telemetry: CarTelemetry,
  policy: TrackCSearchPolicy
): InputSnapshot {
  const contact = car.getContact(track);
  const driver =
    policy.sectors.find((sector) => contact.s < sector.endS) ??
    policy.sectors[policy.sectors.length - 1];
  const lookAhead = clamp(
    driver.lookBase + telemetry.speedMps * driver.lookScale,
    driver.lookMin,
    Math.max(driver.lookMin + 5, driver.lookMax)
  );
  const target = track.getSampleAtS(contact.s + lookAhead);
  const curveTarget = track.getSampleAtS(contact.s + driver.curveLook);
  const currentYaw = Math.atan2(contact.sample.tangent.x, contact.sample.tangent.z);
  const curveYaw = Math.atan2(curveTarget.tangent.x, curveTarget.tangent.z);
  const curveDelta = shortestAngleDelta(currentYaw, curveYaw);
  const turnSign = Math.sign(curveDelta);
  const curveAmount = Math.min(1, Math.abs(curveDelta) / driver.curveDiv);
  const targetLateral = clamp(
    driver.baseLateral + turnSign * (driver.turnLateral + driver.curveLateral * curveAmount),
    -driver.latClamp,
    driver.latClamp
  );
  const toTarget = target.center
    .clone()
    .addScaledVector(target.side, targetLateral)
    .sub(car.position);
  const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
  const headingError = shortestAngleDelta(car.yaw, desiredYaw);
  const steer = clamp(
    headingError * driver.steerGain +
      (targetLateral - contact.lateral) * driver.lateralGain +
      turnSign * driver.feedForward,
    -1,
    1
  );
  const brake =
    telemetry.speedMps > driver.brakeSpeed && curveAmount > driver.brakeCurve
      ? driver.brakeAmount * curveAmount
      : 0;

  return {
    ...base,
    steer,
    throttle: driver.throttle,
    brake,
    checkpointResetPressed: false,
    fullRestartPressed: false,
    pausePressed: false,
    confirmPressed: false
  };
}

function getTrackCDriver(s: number): (typeof TRACK_C_DRIVER)["sectors"]["start"] {
  if (s < TRACK_C_DRIVER.split1) {
    return TRACK_C_DRIVER.sectors.start;
  }
  if (s < TRACK_C_DRIVER.split2) {
    return TRACK_C_DRIVER.sectors.middle;
  }
  if (s < TRACK_C_DRIVER.split3) {
    return TRACK_C_DRIVER.sectors.late;
  }
  return TRACK_C_DRIVER.sectors.finish;
}

function getTrackDInput(
  base: InputSnapshot,
  car: Car,
  track: Track,
  telemetry: CarTelemetry
): InputSnapshot {
  const contact = car.getContact(track);
  const inSpeedcheck = contact.s < 1060;
  const lookAhead = inSpeedcheck
    ? clamp(58 + telemetry.speedMps * 0.45, 72, 112)
    : clamp(22 + telemetry.speedMps * 1.05, 62, 126);
  const target = track.getSampleAtS(contact.s + lookAhead);
  const curveTarget = track.getSampleAtS(contact.s + (inSpeedcheck ? 92 : 176));
  const currentYaw = Math.atan2(contact.sample.tangent.x, contact.sample.tangent.z);
  const curveYaw = Math.atan2(curveTarget.tangent.x, curveTarget.tangent.z);
  const curveDelta = shortestAngleDelta(currentYaw, curveYaw);
  const turnSign = Math.sign(curveDelta);
  const curveAmount = Math.min(1, Math.abs(curveDelta) / 1.45);
  const targetLateral = 0;
  const toTarget = target.center
    .clone()
    .addScaledVector(target.side, targetLateral)
    .sub(car.position);
  const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
  const headingError = shortestAngleDelta(car.yaw, desiredYaw);
  const edgeBias = !inSpeedcheck && contact.absLateral > track.roadWidth / 2 - 5
    ? (0 - contact.lateral) * 0.06
    : 0;
  const steer = clamp(
    headingError * 6.05 +
      (targetLateral - contact.lateral) * 0.11 +
      turnSign * (inSpeedcheck ? -0.03 : -0.02) +
      edgeBias,
    -1,
    1
  );
  const curveBrake =
    !inSpeedcheck && telemetry.speedMps > 58 && curveAmount > 0.36 ? 0.64 * curveAmount : 0;
  const edgeBrake =
    !inSpeedcheck && contact.absLateral > track.roadWidth / 2 - 4 && telemetry.speedMps > 35 ? 0.58 : 0;
  const brake = Math.max(curveBrake, edgeBrake);

  return {
    ...base,
    steer,
    throttle: 1,
    brake,
    checkpointResetPressed: false,
    fullRestartPressed: false,
    pausePressed: false,
    confirmPressed: false
  };
}

function getTrackDSearchInput(
  base: InputSnapshot,
  car: Car,
  track: Track,
  telemetry: CarTelemetry,
  policy: TrackDSearchPolicy
): InputSnapshot {
  const contact = car.getContact(track);
  const ramp = policy.ramp ?? TRACK_D_DEFAULT_RAMP;
  let state = TRACK_D_SEARCH_STATE.get(car);
  if (!state || (contact.s <= track.startS + 2 && telemetry.speedMps < 1)) {
    state = { steer: 0 };
    TRACK_D_SEARCH_STATE.set(car, state);
  }
  const driver =
    policy.sectors.find((sector) => contact.s < track.length * sector.endRatio) ??
    policy.sectors[policy.sectors.length - 1];
  const lookAhead = clamp(
    driver.lookBase + telemetry.speedMps * driver.lookScale,
    driver.lookMin,
    Math.max(driver.lookMin + 5, driver.lookMax)
  );
  const target = track.getSampleAtS(contact.s + lookAhead);
  const curveTarget = track.getSampleAtS(contact.s + driver.curveLook);
  const currentYaw = Math.atan2(contact.sample.tangent.x, contact.sample.tangent.z);
  const curveYaw = Math.atan2(curveTarget.tangent.x, curveTarget.tangent.z);
  const curveDelta = shortestAngleDelta(currentYaw, curveYaw);
  const turnSign = Math.sign(curveDelta);
  const curveAmount = Math.min(1, Math.abs(curveDelta) / driver.curveDiv);
  const landingBlend = smoothWindow(contact.s, TRACK_D_GAP_END_S - 20, TRACK_D_GAP_END_S + 150);
  const targetLateral = clamp(
    driver.baseLateral +
      turnSign * (driver.turnLateral + driver.curveLateral * curveAmount) +
      ramp.landingLateralBias * landingBlend,
    -driver.latClamp,
    driver.latClamp
  );
  const toTarget = target.center
    .clone()
    .addScaledVector(target.side, targetLateral)
    .sub(car.position);
  const desiredYaw = Math.atan2(toTarget.x, toTarget.z);
  const headingError = shortestAngleDelta(car.yaw, desiredYaw);
  const edgeBrake =
    (policy.edgeBrake ?? 0.35) > 0 &&
    contact.absLateral > track.roadWidth / 2 - (policy.edgeBrakeMargin ?? 2) &&
    telemetry.speedMps > (policy.edgeBrakeSpeed ?? 38)
      ? policy.edgeBrake ?? 0.35
      : 0;
  const rawSteer = clamp(
    headingError * driver.steerGain +
      (targetLateral - contact.lateral) * driver.lateralGain +
      turnSign * (driver.feedForward + ramp.landingFeedForward * landingBlend),
    -1,
    1
  );
  const steerTarget = telemetry.airborne ? rawSteer * ramp.airSteerScale : rawSteer;
  state.steer += (steerTarget - state.steer) * ramp.steerSmooth;
  const curveBrake =
    telemetry.speedMps > driver.brakeSpeed && curveAmount > driver.brakeCurve
      ? driver.brakeAmount * curveAmount
      : 0;
  const rampBrake = inRange(contact.s, ramp.rampBrakeStartS, ramp.rampBrakeEndS)
    ? ramp.rampBrake
    : 0;
  const throttle = inRange(contact.s, ramp.rampThrottleStartS, ramp.rampThrottleEndS)
    ? ramp.rampThrottle
    : driver.throttle;

  return {
    ...base,
    steer: clamp(state.steer, -1, 1),
    throttle,
    brake: Math.max(edgeBrake, curveBrake, rampBrake),
    checkpointResetPressed: false,
    fullRestartPressed: false,
    pausePressed: false,
    confirmPressed: false
  };
}

function inRange(value: number, start: number, end: number): boolean {
  return end > start && value >= start && value <= end;
}

function smoothWindow(value: number, start: number, end: number): number {
  if (end <= start) return value >= start ? 1 : 0;
  const x = clamp((value - start) / (end - start), 0, 1);
  return x * x * (3 - 2 * x);
}
