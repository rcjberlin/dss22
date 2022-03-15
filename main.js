const DEFAULT_SUBMIT_HOST = "https://rcj.pythonanywhere.com";
const DEFAULT_SUBMIT_PATH = "/api/v1/submit_run";

const CHECK_LOGIN_PATH = "/api/v1/login_required";

const DEFAULT_EVENT = "2022-berlin";

const TILE_ID_OFFSET = 1; // = id of start tile

const LS_CURRENT_SCREEN = "rcj22ber-currentScreen";
const LS_DATA           = "rcj22ber-data";
const LS_RUN_HISTORY    = "rcj22ber-runHistory";

const GAP          = "gap";
const OBSTACLE     = "obstacle";
const SPEEDBUMP    = "speedbump";
const RAMP         = "ramp";
const INTERSECTION = "intersection";

const COMPETITION_LINE = "line";
const COMPETITION_ENTRY = "entry";

const LOG_SECTION_COMPLETE = "SECTION COMPLETE";
const LOG_LOP              = "LACK OF PROGRESS";
const LOG_SKIP_SECTION     = "SKIP SECTION";
const LOG_ADD_PREFIX       = "ADD";
const LOG_DEL_PREFIX       = "DEL";
const LOG_LAST_CHECKPOINT  = "LAST CHECKPOINT";

const STATUS_SUCCESSFUL = "SUCCESSFUL";
const STATUS_FAILED     = "FAILED";

const pathImageTimeStart = "img/start.svg";
const pathImageTimePause = "img/pause.svg";

const POINTS_TILE_FIRST_TRY  = 5;
const POINTS_TILE_SECOND_TRY = 3;
const POINTS_TILE_THIRD_TRY  = 1;
const POINTS_GAP          = 10;
const POINTS_OBSTACLE     = 15;
const POINTS_SPEEDBUMP    =  5;
const POINTS_RAMP         =  0; // not used for RCJ 2022 Berlin
const POINTS_INTERSECTION = 10;
const POINTS_LOW_VICTIM_ALIVE   = 30;
const POINTS_LOW_VICTIM_DEAD    = 20;
const POINTS_HIGH_VICTIM_ALIVE  = 40;
const POINTS_HIGH_VICTIM_DEAD   = 30;
const POINTS_VICTIM_DEAD_BEFORE =  5;
const POINTS_DEDUCTION_LOP      =  5; // per victim
const POINTS_FINDING_LINE       = 20;
const POINTS_ENTRY_VICTIM       = 40;

const frequencyShortAlert = 600;
const frequencyLongAlert  = 800;
const durationShortAlert = 200;
const durationLongAlert  = 500;

let shortBeep = function () {
	beep(frequencyShortAlert, durationShortAlert, 1, "sine");
};

let longBeep = function () {
	beep(frequencyLongAlert, durationLongAlert, 1, "sine");
	window.navigator.vibrate(durationLongAlert*1.2);
};

let MAX_TIME = 8*60;
let alerts = [{ time: -5, func: shortBeep, finished: false },
			  { time: -4, func: shortBeep, finished: false },
			  { time: -3, func: shortBeep, finished: false },
			  { time: -2, func: shortBeep, finished: false },
			  { time: -1, func: shortBeep, finished: false },
			  { time: -0, func: longBeep, finished: false }];

let data = {};
let competitions = {};
let runHistory = {};

let intervalIdTime = null;
let timeoutIdNotification = null;

let url = new URL(window.location.href);

let getTime = function () {
	return (new Date).getTime() / 1000;
};

let cloneObject = function (obj) {
	return JSON.parse(JSON.stringify(obj));
};

let pad = function (value, length, character) {
	if (length === undefined) { length = 2; }
	if (character === undefined) { character = 0; }
	value = String(value);
	return String(character).repeat(Math.max(0, length-value.length)) + value;
};

window.onload = function() {
	loadCompetitionInfo();
	loadDataFromLocalStorage();
	loadRunHistoryFromLocalStorage();
	initializeMissingData();
	
	adjustSizeOfMainUI();
	
	addEventListenersForNavigationButtons();
	addEventListenersForButtons();
	addEventListenersForInputs();
	addEventListenersForScoringElementButtons();
	
	readCredentialsFromURLIfSupplied();
	
	showInitialScreen();
	showVersionInS8();
};

let isTimeRunning = function () {
	if (data["currentRun"] === null) {
		return false;
	}
	return data["currentRun"]["time"]["timeStartedTimestamp"] !== null;
};

let startAutoUpdatingTime = function () {
	stopAutoUpdatingTime();
	intervalIdTime = setInterval(updateTime, 20);
};

let stopAutoUpdatingTime = function () {
	if (intervalIdTime !== null) {
		clearInterval(intervalIdTime);
		intervalIdTime = null;
	}
};

let setIconsForTimeRunning = function () {
	document.getElementById("s3-time-start-pause").src = pathImageTimePause;
	document.getElementById("s4-time-start-pause").src = pathImageTimePause;
	document.getElementById("s4-prev").classList.add("disabled");
	document.getElementById("s4-next").classList.add("disabled");
};

let setIconsForTimePaused = function () {
	document.getElementById("s3-time-start-pause").src = pathImageTimeStart;
	document.getElementById("s4-time-start-pause").src = pathImageTimeStart;
	document.getElementById("s4-prev").classList.remove("disabled");
	document.getElementById("s4-next").classList.remove("disabled");
};

let toggleTimeRunning = function () {
	let time = getTime();
	if (!isTimeRunning()) { // time currently paused -> start time
		data["currentRun"]["time"]["timeStartedTimestamp"] = time;
		if (data["currentRun"]["time"]["timestampRunStart"] === null) {
			data["currentRun"]["time"]["timestampRunStart"] = time;
		}
		data["currentRun"]["time"]["timestampRunEnd"] = null;
		setIconsForTimeRunning();
		startAutoUpdatingTime();
	}
	else { // time currently running -> pause time
		data["currentRun"]["time"]["timeOffset"] = data["currentRun"]["time"]["timeOffset"]
													+ time
													- data["currentRun"]["time"]["timeStartedTimestamp"];
		data["currentRun"]["time"]["timeStartedTimestamp"] = null;
		data["currentRun"]["time"]["timestampRunEnd"] = time;
		setIconsForTimePaused();
		stopAutoUpdatingTime();
		updateTime();
		data["currentRun"]["originalValues"]["time"] = getRunTimeInSeconds();
	}
	saveDataToLocalStorage();
};

let getRunTimeInSeconds = function () {
	if (data["currentRun"] === null) {
		return 0;
	}
	let time = data["currentRun"]["time"]["timeOffset"];
	if (data["currentRun"]["time"]["timeStartedTimestamp"] !== null) {
		time += getTime() - data["currentRun"]["time"]["timeStartedTimestamp"];
	}
	return time;
};

let updateTime = function () {
	checkForAlerts();
	let timeString = getRunTimeAsString();
	document.getElementById("s3-time").innerText = timeString;
	document.getElementById("s4-time").innerText = timeString;
	document.getElementById("s4-remaining-time").innerText = getRemainingTimeAsString();

	let ovs = data["currentRun"]["originalValues"];
	if (ovs["time"] !== undefined) {
		document.getElementById("time-modal-original-time").innerText = getSecondsAsTimeString(ovs["time"]);
	} else {
		document.getElementById("time-modal-original-time").innerText = timeString;
	}
	document.getElementById("review-time").innerText = timeString;
};

let getRunTimeAsString = function () {
	return getSecondsAsTimeString(getRunTimeInSeconds());
};

let getRemainingTimeAsString = function () {
    let time = MAX_TIME - Math.floor(getRunTimeInSeconds());
    return (time < 0 ? "-" : "") + getSecondsAsTimeString(Math.abs(time));
};

let getSecondsAsTimeString = function (timeInSeconds) {
	let minutes = Math.floor(timeInSeconds/60);
	let seconds = Math.floor(timeInSeconds%60);
	minutes = (minutes < 10 ? minutes : (minutes > 15 ? "X" : minutes.toString(16)));
	seconds = (seconds < 10 ? "0" : "") + seconds;
	return minutes + ":" + seconds;
};

let resetTime = function () {
	stopAutoUpdatingTime()
	data["currentRun"]["time"]["timeOffset"] = 0.0;
	data["currentRun"]["time"]["timeStartedTimestamp"] = null;
	data["currentRun"]["time"]["timestampRunStart"] = null;
	data["currentRun"]["time"]["timestampRunEnd"] = null;
	saveDataToLocalStorage();
	
	resetAlerts();
	updateTime();
	setIconsForTimePaused();
};

let btnResetTime = function () {
	// if in review -> reset to original value
	if (localStorage.getItem(LS_CURRENT_SCREEN) == "6") {
		data["currentRun"]["time"]["timeOffset"] = data["currentRun"]["originalValues"]["time"];
		updateTime();
		updateReviewSummaryOfChanges();
		saveDataToLocalStorage();
		hideTimeModal();
	} else {
		if (confirm("Are you sure to reset the time? You can't undo this step.")) {
			resetTime();
			hideTimeModal();
		}
	}
};

let btnSetTime = function () {
	let time = getRunTimeInSeconds();
	document.getElementById("time-modal-minutes").value = Math.floor(time/60);
	document.getElementById("time-modal-seconds").value = Math.floor(time%60);
	makeTimeDoubleDigit();
	showTimeModal();
};

let initializeTime = function () {
	setMaxTimeBasedOnRoundName();
	if (data["currentRun"] !== null) {
		updateTime();
		if (isTimeRunning()) {
			startAutoUpdatingTime();
			setIconsForTimeRunning();
		} else {
			setIconsForTimePaused();
		}
	}
};

let checkForAlerts = function () {
	if (!isTimeRunning()) { return; }
	let time = getRunTimeInSeconds();
	let diff;
	for (let i=0; i<alerts.length; i++) {
		diff = time - (MAX_TIME + alerts[i].time);
		if (diff > 0 && diff < 1 && alerts[i].finished === false) {
			alerts[i].func();
			alerts[i].finished = true;
		}
	}
};

let resetAlerts = function () {
	for (let i=0; i<alerts.length; i++) {
		alerts[i].finished = false;
	}
};

let addEventListenersForNavigationButtons = function () {
	document.getElementById("s1-next").addEventListener("click", function(e) {
		changeScreen(1, 2);
	});
	
	document.getElementById("s2-prev").addEventListener("click", function(e) {
		changeScreen(2,1);
	});
	
	document.getElementById("s2-next").addEventListener("click", function(e) {
		if (data["currentRun"] !== null &&
			data["currentRun"]["referee"]["name"] !== "" &&
			[COMPETITION_LINE, COMPETITION_ENTRY].includes(data["currentRun"]["competition"]) &&
			competitions[data["currentRun"]["competition"]]["arenas"].includes(data["currentRun"]["arena"]) &&
			competitions[data["currentRun"]["competition"]]["rounds"].includes(data["currentRun"]["round"]) &&
			competitions[data["currentRun"]["competition"]]["teams"].includes(data["currentRun"]["teamname"]) &&
			( data["currentRun"]["evacuationPoint"] === "low" ||
			 (data["currentRun"]["evacuationPoint"] === "high" && data["currentRun"]["competition"] === COMPETITION_LINE))) {
			changeScreen(2, 3);
		}
	});
	
	document.getElementById("s3-prev").addEventListener("click", function(e) {
		if (getRunTimeInSeconds() === 0) {
			changeScreen(3, 2);
		} else {
			if (confirm("Warning: If you change the competition or team you delete the current run and probably lose data.")) {
				changeScreen(3, 2);
			}
		}
	});
	
	document.getElementById("s3-next").addEventListener("click", function(e) {
		changeScreen(3, 4);
	});
	
	document.getElementById("s4-prev").addEventListener("click", function(e) {
		if (!isTimeRunning()) {
			changeScreen(4, 3);
		}
	});
	
	document.getElementById("s4-next").addEventListener("click", function(e) {
		if (!isTimeRunning()) {
			changeScreen(4, 5);
		}
	});
	
	document.getElementById("s5-prev").addEventListener("click", function(e) {
		changeScreen(5, 4);
	});
	
	document.getElementById("s5-next").addEventListener("click", function(e) {
		changeScreen(5, 6);
	});
	
	document.getElementById("s6-prev").addEventListener("click", function(e) {
		changeScreen(6, 5);
	});
};

let btnS1ViewData = function () {
	changeScreen(1, 8);
};

let btnS7NewRun = function () {
	document.getElementById("teamname").value = "";
	changeScreen(7, 2);
};

let btnS7ViewData = function () {
	changeScreen(7, 8);
};

let btnS8Setup = function () {
	changeScreen(8, 1);
};

let btnS8NewRun = function () {
	document.getElementById("teamname").value = "";
	changeScreen(8, 2);
};

let btnS8CheckLogin = function () {
	let url = data["submitConfig"]["host"] + CHECK_LOGIN_PATH;

	fetch(url, {
		method: 'GET',
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': 'Basic ' + btoa(data["referee"]["name"] + ":" + data["referee"]["auth"])
		}
	})
	.then(async function (response) {
		let text = await response.text();
		if (response.status === 200 && text === "ok") {
			document.getElementById("s8-check-login-result").innerText = "Login OK";
		} else {
			throw text;
		}
	})
	.catch((error) => {
		document.getElementById("s8-check-login-result").innerText = "Login Failed";
	});
};

let addEventListenersForButtons = function () {
	document.getElementById("s3-time-start-pause").addEventListener("click", function(e) {
		toggleTimeRunning();
	});
	document.getElementById("s4-time-start-pause").addEventListener("click", function(e) {
		toggleTimeRunning();
	});
	document.getElementById("s4-btn-section-complete").addEventListener("click", function(e) {
		sectionComplete();
	});
	document.getElementById("s4-btn-section-lop").addEventListener("click", function(e) {
		sectionLoP();
	});
	document.getElementById("s4-btn-section-skip").addEventListener("click", function(e) {
		sectionSkip();
	});
	document.getElementById("s4-btn-undo").addEventListener("click", function(e) {
		undoLastLog();
	});
	document.getElementById("s4-btn-last-checkpoint").addEventListener("click", function(e) {
		toggleLastCheckpoint();
	});
	document.getElementById("s6-btn-submit").addEventListener("click", function(e) {
		tryToSubmitRun();
	});
	document.getElementById("time-modal-close").addEventListener("click", function(e) {
		hideTimeModal();
	});
	window.onclick = function(event) {
		if (event.target === document.getElementById("time-modal")) {
			hideTimeModal();
		}
	};
	window.addEventListener("keydown", function (e) {
		if (e.key === "Escape") {
			hideTimeModal();
		}
	});
	document.getElementById("time-modal-save").addEventListener("click", function(e) {
		saveTimeFromTimeModal();
	});
};

let addEventListenersForInputs = function () {
	document.getElementById("referee-name").addEventListener("change", onChangeInputRefereeName);
	document.getElementById("referee-password").addEventListener("change", onChangeInputRefereePassword);
	document.getElementById("competition").addEventListener("change", onChangeInputCompetition);
	document.getElementById("arena").addEventListener("change", () => onChangeInputArena("arena"));
	document.getElementById("round").addEventListener("change", onChangeInputRound);
	
	document.getElementById("teamname").addEventListener("change", onChangeInputTeamname);
	document.getElementById("evacuation-point-low").addEventListener("change", () => onChangeInputEvacuationPoint("evacuation-point-high"));
	document.getElementById("evacuation-point-high").addEventListener("change", () => onChangeInputEvacuationPoint("evacuation-point-high"));
	
	document.getElementById("team-showed-up").addEventListener("change", onChangeInputTeamShowedUp);
	document.getElementById("s3-arena").addEventListener("change", () => onChangeInputArena("s3-arena"));
	document.getElementById("s3-evacuation-point-low").addEventListener("change", () => onChangeInputEvacuationPoint("s3-evacuation-point-high"));
	document.getElementById("s3-evacuation-point-high").addEventListener("change", () => onChangeInputEvacuationPoint("s3-evacuation-point-high"));
	
	document.getElementById("s5-tiles-per-section").addEventListener("change", onChangeInputS5TileInput);
	document.getElementById("s5-tile-ids").addEventListener("change", onChangeInputS5TileInput);
	document.getElementById("victims-dead-before").addEventListener("change", onChangeInputVictims);
	document.getElementById("victims-alive").addEventListener("change", onChangeInputVictims);
	document.getElementById("victims-dead-after").addEventListener("change", onChangeInputVictims);
	document.getElementById("left-evacuation-zone").addEventListener("change", onChangeInputLeftEvacuationZone);
	document.getElementById("review-comments").addEventListener("change", onChangeInputReviewComments);
	document.getElementById("review-teamname").addEventListener("change", onChangeInputReviewTeamname);
	document.getElementById("review-radio-ok").addEventListener("change", onChangeInputReviewOk);
	document.getElementById("review-radio-complaints").addEventListener("change", onChangeInputReviewRadioComplaints);
	document.getElementById("review-complaints").addEventListener("change", onChangeInputReviewComplaints);
	
	document.getElementById("event").addEventListener("change", onChangeInputSettingsEvent);
	document.getElementById("submit-host").addEventListener("change", onChangeInputSettingsSubmitHost);
	document.getElementById("submit-path").addEventListener("change", onChangeInputSettingsSubmitPath);

	let tmm = document.getElementById("time-modal-minutes");
	tmm.addEventListener("input", onInputTimeModalMinutes);
	tmm.addEventListener("change", makeTimeDoubleDigit);
	tmm.addEventListener("keydown", function (e) {
		if (e.key === "ArrowUp") { onClickTimeModalMinutesPlus(); }
		else if (e.key === "ArrowDown") { onClickTimeModalMinutesMinus(); }
	});
	tmm.parentNode.parentNode.childNodes[1].addEventListener("click", onClickTimeModalMinutesPlus);
	tmm.parentNode.parentNode.childNodes[5].addEventListener("click", onClickTimeModalMinutesMinus);
	let tms = document.getElementById("time-modal-seconds");
	tms.addEventListener("input", onInputTimeModalSeconds);
	tms.addEventListener("change", makeTimeDoubleDigit);
	tms.addEventListener("keydown", function (e) {
		if (e.key === "ArrowUp") { onClickTimeModalSecondsPlus(); }
		else if (e.key === "ArrowDown") { onClickTimeModalSecondsMinus(); }
	});
	tms.parentNode.parentNode.childNodes[1].addEventListener("click", onClickTimeModalSecondsPlus);
	tms.parentNode.parentNode.childNodes[5].addEventListener("click", onClickTimeModalSecondsMinus);
	makeTimeDoubleDigit();
};

let onInputTimeModalMinutes = function (e) {
	let el = document.getElementById("time-modal-minutes");
	if (e.inputType === "insertText" && !["0","1","2","3","4","5","6","7","8","9"].includes(e.data)) {
		let value = "";
		for (let c of el.value) {
			if (["0","1","2","3","4","5","6","7","8","9"].includes(c)) {
				value += String(c);
			}
		}
		el.value = value;
		return;
	}
	const maxMinutes = Math.floor((MAX_TIME / 60) + (MAX_TIME % 60 === 0 ? 0 : 1));
	if (el.value < 0) {
		el.value = 0;
		document.getElementById("time-modal-seconds").value = 0;
	} else if (el.value > maxMinutes - 1) {
		el.value = maxMinutes;
		document.getElementById("time-modal-seconds").value = 0;
	}
};

let onInputTimeModalSeconds = function (e) {
	let el = document.getElementById("time-modal-seconds");
	if (e.inputType === "insertText" && !["0","1","2","3","4","5","6","7","8","9"].includes(e.data)) {
		let value = "";
		for (let c of el.value) {
			if (["0","1","2","3","4","5","6","7","8","9"].includes(c)) {
				value += String(c);
			}
		}
		el.value = value;
		return;
	}
	if (el.value < 0) {
		el.value = 0;
	} else if (el.value > 59) {
		onClickTimeModalMinutesPlus();
		el.value = el.value%60;
	}
};

let onClickTimeModalMinutesPlus = function () {
	let el = document.getElementById("time-modal-minutes");
	el.value = Number(el.value) + 1;
	const maxMinutes = Math.floor((MAX_TIME / 60) + (MAX_TIME % 60 === 0 ? 0 : 1));
	if (el.value > maxMinutes - 1) {
		el.value = maxMinutes;
		document.getElementById("time-modal-seconds").value = 0;
	}
	makeTimeDoubleDigit();
};

let onClickTimeModalMinutesMinus = function () {
	let el = document.getElementById("time-modal-minutes");
	el.value = Number(el.value) - 1;
	if (el.value < 0) {
		el.value = 0;
		document.getElementById("time-modal-seconds").value = 0;
	}
	makeTimeDoubleDigit();
};

let onClickTimeModalSecondsPlus = function () {
	let el = document.getElementById("time-modal-seconds");
	el.value = Number(el.value) + 1;
	if (document.getElementById("time-modal-minutes").value > 7) {
		el.value = 0;
	} else if (el.value > 59) {
		el.value = 0;
		onClickTimeModalMinutesPlus();
	}
	makeTimeDoubleDigit();
};

let onClickTimeModalSecondsMinus = function () {
	let el = document.getElementById("time-modal-seconds");
	el.value = Number(el.value) - 1;
	if (el.value < 0) {
		el.value = 59;
		onClickTimeModalMinutesMinus();
	}
	makeTimeDoubleDigit();
};

let makeTimeDoubleDigit = function () {
	let tmm = document.getElementById("time-modal-minutes");
	let tms = document.getElementById("time-modal-seconds");
	tmm.value = pad(tmm.value).slice(-2);
	tms.value = pad(tms.value).slice(-2);
};

let saveTimeFromTimeModal = function () {
	let minutes = Number(document.getElementById("time-modal-minutes").value);
	let seconds = Number(document.getElementById("time-modal-seconds").value);
	let newRunTimeInSeconds = minutes*60 + seconds;
	data["currentRun"]["time"]["timeOffset"] += newRunTimeInSeconds - getRunTimeInSeconds();
	saveDataToLocalStorage();
	updateTime();
	hideTimeModal();
	updateReviewSummaryOfChanges();
};

let hideTimeModal = function () {
	document.getElementById("time-modal").style.display = "none";
};
let showTimeModal = function () {
	document.getElementById("time-modal").style.display = "block";
};

let changeLocalData = function (name, value) {
	if (name.startsWith("referee-")) {
		name = name.substring(8);
		data["referee"][name] = value;
		if (data["currentRun"] !== null) {
			data["currentRun"]["referee"][name] = value;
		}
	} else if (name.startsWith("submitConfig-")) {
		name = name.substring(13);
		data["submitConfig"][name] = value;
	} else if (name.startsWith("lastSubmitStatus-")) {
		name = name.substring(17);
		data["lastSubmitStatus"][name] = value;
	} else {
		data[name] = value;
		if (data["currentRun"] !== null) {
			data["currentRun"][name] = value;
		}
	}
	saveDataToLocalStorage();
};

let onChangeInputRefereeName = function () {
	changeLocalData("referee-name", document.getElementById("referee-name").value);
};

let onChangeInputRefereePassword = function () {
	changeLocalData("referee-auth", document.getElementById("referee-password").value);
};

let onChangeInputCompetition = function () {
	let selectedCompetition = document.getElementById("competition").value;
	if (selectedCompetition !== COMPETITION_LINE && selectedCompetition !== COMPETITION_ENTRY) {
		selectedCompetition = COMPETITION_LINE;
		document.getElementById("competition").value = selectedCompetition;
	}
	
	let competitionInfo = competitions[selectedCompetition];
	if (competitionInfo === undefined) {
		competitionInfo = { arenas: [], rounds: [], teams: [] };
	}
	
	setSelectInputOptions("arena", competitionInfo["arenas"]);
	setSelectInputOptions("s3-arena", competitionInfo["arenas"]);
	setSelectInputOptions("round", competitionInfo["rounds"]);
	setSelectInputOptions("teamname", competitionInfo["teams"]);
	
	// teamname
	data["currentRun"] = null;
	
	// evacuation point
	document.getElementById("evacuation-point-low").checked = true;
	document.getElementById("s3-evacuation-point-low").checked = true;
	for (const inputId of ["evacuation-point-low", "evacuation-point-high",
			"s3-evacuation-point-low", "s3-evacuation-point-high"]) {
		document.getElementById(inputId).disabled = selectedCompetition === COMPETITION_ENTRY;
	}
	
	// save to data / Local Storage
	changeLocalData("competition", selectedCompetition);
	changeLocalData("arena", document.getElementById("arena").value);
	changeLocalData("round", document.getElementById("round").value);
};

let onChangeInputArena = function (id="arena") {
	changeLocalData("arena", document.getElementById(id).value);
	document.getElementById(id === "arena" ? "s3-arena" : "arena").value = document.getElementById(id).value;
};

let onChangeInputRound = function () {
	changeLocalData("round", document.getElementById("round").value);
};

function setMaxTimeBasedOnRoundName () {
	const r = data["currentRun"]["round"];
	if (r.includes("Video")) {
		MAX_TIME = 4*60;
	} else if (r.includes("Live")) {
		MAX_TIME = 5*60;
	} else {
		MAX_TIME = 8*60;
	}
}

let setSelectInputOptions = function (selectId, options) {
	let selectInput = document.getElementById(selectId);
	
	// remove all options
	selectInput.options.length = 0;
	
	// add option for all elements in passed array
	options.sort((op1,op2) => {
		return op1.toLowerCase().localeCompare(op2.toLowerCase());
	});
	for (let i=0; i < options.length; i++) {
		selectInput.options[selectInput.options.length] = new Option(options[i], options[i], false, false);
	}
	
	selectInput.value = "";
};

let createNewRun = function (teamname, evacuationPoint) {
	data["currentRun"] = getNewRun();
	data["currentRun"]["teamname"] = teamname;
	data["currentRun"]["evacuationPoint"] = evacuationPoint;
	
	saveDataToLocalStorage();
	updateUIElementsForRun();
	resetAlerts();
	resetTime();
};

let onChangeInputTeamname = function () {
	createNewRun(document.getElementById("teamname").value,
				 document.getElementById("evacuation-point-high").checked ? "high" : "low");
};

let onChangeInputEvacuationPoint = function (idEvacuationPointHigh="evacuation-point-high") {
	data["currentRun"]["evacuationPoint"] = document.getElementById(idEvacuationPointHigh).checked ? "high" : "low";
	document.getElementById("evacuation-point-" + data["currentRun"]["evacuationPoint"]).checked = true;
	document.getElementById("s3-evacuation-point-" + data["currentRun"]["evacuationPoint"]).checked = true;
	saveDataToLocalStorage();
};

let onChangeInputTeamShowedUp = function () {
	data["currentRun"]["teamStarted"] = document.getElementById("team-showed-up").checked;
	saveDataToLocalStorage();
};

let getNewRun = function () {
	return {
		referee: {
			name: data["referee"]["name"],
			auth: data["referee"]["auth"],
		},
		competition: data["competition"],
		arena: data["arena"],
		round: data["round"],
		teamname: "",
		evacuationPoint: "",
		time: {
			timeOffset: 0.0,
			timeStartedTimestamp: null,
			timestampRunStart: null,
			timestampRunEnd: null
		},
		teamStarted: true,
		sections: [
			getNewSection(1),
		],
		victims: {
			deadVictimsBeforeAllLivingVictims: 0,
			livingVictims: 0,
			deadVictimsAfterAllLivingVictims: 0,
		},
		leftEvacuationZone: false,
		comments: "",
		confirmedByTeamCaptain: false,
		complaints: "",
		logs: [],
		logsUndone: [],
		originalValues: {},
	};
};

let getNewSection = function (sectionId) {
	return {
		sectionId: sectionId,
		completedSection: false,
		skippedSection: false,
		lops: 0,
		isAfterLastCheckpoint: false,
		gaps: 0,
		obstacles: 0,
		speedbumps: 0,
		ramps: 0,
		intersections: 0,
		tiles: null,
	};
};

let createNewSection = function () {
	data["currentRun"]["sections"].push(getNewSection(getNumberOfSections() + 1));
};

let updateUIElementsForRun = function () {
	document.getElementById("teamname").value = data["currentRun"]["teamname"];
	
	if (data["currentRun"]["evacuationPoint"] === "high") {
		document.getElementById("evacuation-point-high").checked = true;
	} else {
		document.getElementById("evacuation-point-low").checked = true;
	}
	
	document.getElementById("team-showed-up").checked = data["currentRun"]["teamStarted"];
	
	updateTime();
	
	updateUIElementsS4();
};

let updateUIElementsS4 = function () {
	updateUISectionAndTry();
	setCaptions();
	updateCompleteButton();
	updateSkipButton();
	updateUndoButton();
	updateLastCheckpointButton();
};

let updateUISectionAndTry = function () {
	let currentSection = getCurrentSection();
	document.getElementById("s4-section").innerText = currentSection.sectionId;
	if (currentSection.isAfterLastCheckpoint) {
		// show LoPs after last checkpoint
		document.getElementById("s4-try").innerText = currentSection.lops;
		document.getElementById("s4-txt-try").innerText = "LoPs";
	} else {
		// show current try in "normal" section
		document.getElementById("s4-try").innerText = currentSection.lops + 1;
		document.getElementById("s4-txt-try").innerText = "Try";
	}
};

let getCurrentSection = function () {
	return data["currentRun"]["sections"][getNumberOfSections() - 1];
};

let getNumberOfSections = function () {
	return data["currentRun"]["sections"].length;
};

let setCaptions = function () {
	setCaptionForSections();
	setCaptionsForAllScoringElements();
};

let setCaptionsForAllScoringElements = function () {
	let arr = [GAP, OBSTACLE, SPEEDBUMP, RAMP, INTERSECTION];
	for (let i=0; i<arr.length; i++) {
		setCaptionForScoringElement(arr[i]);
	}
};

let setCaptionForScoringElement = function (name) {
	let txt = "";
	let sections = data["currentRun"]["sections"];
	for (let i=0; i<sections.length; i++) {
		txt += " | " + sections[i][name+"s"];
	}
	
	// remove " | " at front
	txt = txt.substring(3);
	
	// adjust caption to take only the available space
	adjustCaptionToMaxSize("txt-"+name, txt);
};

let setCaptionForSections = function () {
	let txt = "";
	let section;
	for (let i=0; i<getNumberOfSections(); i++) {
		section = data["currentRun"]["sections"][i];
		if (section["isAfterLastCheckpoint"]) { break; }
		if (section["skippedSection"]) {
			txt += " | " + "-";
		} else {
			txt += " | " + (section["lops"] + 1);
		}
	}
	
	txt = txt.substring(3);
	
	adjustCaptionToMaxSize("txt-tries", txt);
};

let adjustCaptionToMaxSize = function (uiElementId, txt) {
	let uiElement = document.getElementById(uiElementId);
	
	// add class for highlighting current section
	let strPrepend = "<span class='s4-text-scoring-elements-last'>";
	let strAppend = "</span>";
	let indexOfLastSpace = txt.lastIndexOf(" ");
	
	if (indexOfLastSpace === -1) {
		txt = strPrepend + txt + strAppend;
	} else {
		txt = txt.substring(0, indexOfLastSpace + 1)
				+ strPrepend
				+ txt.substring(indexOfLastSpace + 1)
				+ strAppend;
	}
	
	// fit to width of UI-Element (replace first numbers with "...")
	uiElement.innerHTML = txt;
	while (uiElement.clientHeight > uiElement.parentElement.clientHeight && txt !== "...") {
		if (txt.startsWith("...") === false) { txt = "..." + txt; }
		if (txt.substring(3).startsWith(strPrepend)) { break; }
		txt = "..." + txt.substring(4);
		uiElement.innerHTML = txt;
	}
};

let updateCompleteButton = function () {
	if (isAllowedToComplete()) {
		document.getElementById("s4-btn-section-complete").classList.remove("disabled");
		document.getElementById("s4-btn-section-complete").children[0].classList.remove("disabled");
	} else {
		document.getElementById("s4-btn-section-complete").classList.add("disabled");
		document.getElementById("s4-btn-section-complete").children[0].classList.add("disabled");
	}
};

let isAllowedToComplete = function () {
	return !isAfterLastCheckpoint();
};

let updateSkipButton = function () {
	if (isAllowedToSkip()) {
		document.getElementById("s4-btn-section-skip").classList.remove("disabled");
		document.getElementById("s4-btn-section-skip").children[0].classList.remove("disabled");
	} else {
		document.getElementById("s4-btn-section-skip").classList.add("disabled");
		document.getElementById("s4-btn-section-skip").children[0].classList.add("disabled");
	}
};

let isAllowedToSkip = function () {
	return (getCurrentSection().lops >= 2) && (!isAfterLastCheckpoint());
};

let updateLastCheckpointButton = function () {
	if (isAfterLastCheckpoint()) {
		document.getElementById("s4-btn-last-checkpoint").style.background = "#fd5e53";
		document.getElementById("s4-btn-last-checkpoint").style.color = "#fff";
	} else {
		document.getElementById("s4-btn-last-checkpoint").style.background = "#fff";
		document.getElementById("s4-btn-last-checkpoint").style.color = "#000";
	}
};

let isAfterLastCheckpoint = function () {
	return getCurrentSection()["isAfterLastCheckpoint"];
};

let addEventListenersForScoringElementButtons = function () {
	let arr = [ {imgId: "img-gap",          name: GAP},
				{imgId: "img-obstacle",     name: OBSTACLE},
				{imgId: "img-speedbump",    name: SPEEDBUMP},
				{imgId: "img-ramp",         name: RAMP},
				{imgId: "img-intersection", name: INTERSECTION}];
	for(let i=0; i<arr.length; i++) {
		document.getElementById(arr[i].imgId).addEventListener("click", function(e) {
			addScoringElement(arr[i].name);
		});
		document.getElementById(arr[i].imgId).addEventListener("contextmenu", function(e) {
			removeScoringElement(arr[i].name);
			e.preventDefault();
		});
	}
};

let adjustSizeOfMainUI = function () {
	/* media-query for aspect-ratio isn't working as wanted in Chrome/Android (problem with disappearing url-bar) */
	let possibleWidth = window.innerWidth;
	let possibleHeight = window.innerHeight; //document.body.clientHeight can be used alternatively (-> possible to hide url-bar)
	if (possibleHeight * 2 / 3 < possibleWidth) {
		document.getElementById("screen-4").style.height = possibleHeight + "px";
		document.getElementById("screen-4").style.width = possibleHeight * 2 / 3 + "px";
	} else {
		document.getElementById("screen-4").style.height = possibleWidth * 3 / 2 + "px";
		document.getElementById("screen-4").style.marginBottom = possibleHeight - possibleWidth * 3 / 2 + "px";
		document.getElementById("screen-4").style.width = possibleWidth + "px";
	}
};

let loadCompetitionInfo = async function () {
	const response = await fetch("./competitions.json");
	competitions = await response.json();
	
	initializeInputs();
};

let loadDataFromLocalStorage = function () {
	data = localStorage.getItem(LS_DATA);
	if (data === null) {
		data = {};
	} else {
		data = JSON.parse(data);
	}
};

let saveDataToLocalStorage = function () {
	localStorage.setItem(LS_DATA, JSON.stringify(data));
};

let initializeMissingData = function () {
	let arr = [ { name: "referee", initialValue: { name: "", auth: "" } },
				{ name: "submitConfig", initialValue: { host: DEFAULT_SUBMIT_HOST, path: DEFAULT_SUBMIT_PATH } },
				{ name: "lastSubmitStatus", initialValue: { status: null, response: null, runInfo: null } },
				{ name: "competition", initialValue: "line" },
				{ name: "event", initialValue: DEFAULT_EVENT },
				{ name: "arena", initialValue: "" },
				{ name: "round", initialValue: "" },
				{ name: "currentRun", initialValue: null }];
	
	for (let i=0; i<arr.length; i++) {
		if (data[arr[i].name] === undefined) {
			data[arr[i].name] = arr[i].initialValue;
		}
	}
	
	saveDataToLocalStorage();
};

let loadRunHistoryFromLocalStorage = function () {
	runHistory = localStorage.getItem(LS_RUN_HISTORY);
	if (runHistory === null) {
		runHistory = {};
	} else {
		runHistory = JSON.parse(runHistory);
	}
};

let saveRunHistoryToLocalStorage = function () {
	localStorage.setItem(LS_RUN_HISTORY, JSON.stringify(runHistory));
};

let showInitialScreen = function () {
	/* shows last opened screen, otherwise first screen */
	let currentScreen = localStorage.getItem(LS_CURRENT_SCREEN);
	if (currentScreen === null) {
		currentScreen = 1;
		localStorage.setItem(LS_CURRENT_SCREEN, currentScreen);
	}
	
	let forceScreen = url.searchParams.get("fs");
	if(forceScreen) {
		currentScreen = forceScreen;
		localStorage.setItem(LS_CURRENT_SCREEN, currentScreen);
	}
	
	// no run exists but a screen which requires a run should be opened -> show first screen
	if ([3, 4, 5, 6].includes(+currentScreen) && data["currentRun"] === null) {
		currentScreen = 1;
		localStorage.setItem(LS_CURRENT_SCREEN, currentScreen);
	}
	
	showScreen(currentScreen);
};

let showScreen = function (screenNumber) {
	let initFunction = [null, null, initScreen2, initScreen3, null, initScreen5, initScreen6, initScreen7, initScreen8][screenNumber];
	if (initFunction !== null) { initFunction(); }
	document.getElementById("screen-" + screenNumber).style.display = "";
};

let hideScreen = function (screenNumber) {
	document.getElementById("screen-" + screenNumber).style.display = "none";
};

let changeScreen = function (screenNumberFrom, screenNumberTo) {
	hideScreen(screenNumberFrom);
	showScreen(screenNumberTo);
	localStorage.setItem(LS_CURRENT_SCREEN, screenNumberTo);
	
	window.location.hash = "#" + screenNumberTo; // "disables" go-back-button of browser
};

let initScreen2 = function () {
	document.getElementById("s2-txt-referee-name").innerText = data["referee"]["name"];
	document.getElementById("s2-txt-competition").innerText = convertCompetitionIdToString(data["competition"]);
	document.getElementById("s2-txt-arena").innerText = convertArenaIdToString(data["arena"]);
	document.getElementById("s2-txt-round").innerText = convertRoundIdToString(data["round"]);
};

let convertCompetitionIdToString = function (competitionId) {
	let str = "Error";
	if (competitionId === COMPETITION_LINE) {
		str = "Rescue Line";
	} else if (competitionId === COMPETITION_ENTRY) {
		str = "Rescue Line Entry";
	}
	return str;
};

let convertArenaIdToString = function (arenaId) {
	return arenaId.startsWith("Arena ") ? arenaId.substring(6) : arenaId;
};

let convertRoundIdToString = function (roundId) {
	return roundId.startsWith("Round ") ? roundId.substring(6) : roundId;
};

let initScreen3 = function () {
	let txt;
	
	// teamname
	txt = data["currentRun"]["teamname"];
	document.getElementById("s3-txt-teamname").innerHTML = txt;
	
	// evacuation point
	txt = data["currentRun"]["evacuationPoint"];
	document.getElementById("s3-txt-evacuation-point").innerHTML = txt;

	// time + last checkpoint
	setMaxTimeBasedOnRoundName();
	if (data["currentRun"]["round"].includes("Video Victims")) {
		getCurrentSection()["isAfterLastCheckpoint"] = true;
		updateLastCheckpointButton();
		saveDataToLocalStorage();
	}
};

let templateS5Section = `
	<div>
		<div class="table-layout-column-left">
			<label for="tiles-section-{sectionId}" class="table-layout-cell-left">Section {sectionId}<br><span class="disabled">({tries})</span></label>
		</div>
		<div class="table-layout-column-right">
			<input type="number" id="tiles-section-{sectionId}" class="table-layout-cell-right" value="{tiles}" min="1" />
		</div>
		<p class="clear" />
	</div>
`;

let initScreen5 = function () {
	// tiles for each section
	let isEnteringTilesPerSection = false;
	if (document.getElementById("s5-tiles-per-section").checked === false &&
			document.getElementById("s5-tile-ids").checked === false) {
		document.getElementById("s5-tile-ids").checked = true;
	} else if (document.getElementById("s5-tiles-per-section").checked === true) {
		isEnteringTilesPerSection = true;
	}

	let sections = "", sectionIds = [], tries = null, section = null, tileSum = TILE_ID_OFFSET;
	for (let i=0; i<data["currentRun"]["sections"].length; i++) {
		section = data["currentRun"]["sections"][i];
		if (section["isAfterLastCheckpoint"]) {
			continue;
		} else if (section["completedSection"]) {
			tries = section["lops"] + 1;
			switch (tries) {
				case 1: tries += "st"; break;
				case 2: tries += "nd"; break;
				case 3: tries += "rd"; break;
				default: tries += "th";
			}
			tries += " try";
		} else if (section["skippedSection"]) {
			tries = "skipped";
		} else {
			tries = "aborted";
		}
		tileSum += section["tiles"];
		sections += templateS5Section
					.replace(/\{sectionId\}/g, section["sectionId"])
					.replace(/\{tries\}/g, tries)
					.replace(/\{tiles\}/g, (isEnteringTilesPerSection ? section["tiles"] : tileSum));
		sectionIds.push(section["sectionId"]);
	}
	document.getElementById("s5-tiles").innerHTML = sections;
	for (let i=0; i<sectionIds.length; i++) {
		document.getElementById("tiles-section-"+sectionIds[i]).addEventListener("change", onChangeInputTiles);
	}
	onChangeInputTiles(); // invoke to update warnings
	
	// victims
	document.getElementById("victims-dead-before").value = data["currentRun"]["victims"]["deadVictimsBeforeAllLivingVictims"];
	document.getElementById("victims-alive").value       = data["currentRun"]["victims"]["livingVictims"];
	document.getElementById("victims-dead-after").value  = data["currentRun"]["victims"]["deadVictimsAfterAllLivingVictims"];
	
	// left evacuation zone
	document.getElementById("left-evacuation-zone").checked = data["currentRun"]["leftEvacuationZone"];
	
	// disable victims and left-evacuation-zone if not after-last-checkpoint
	let elementIds = ["victims-dead-before", "victims-alive", "victims-dead-after", "left-evacuation-zone"];
	let alc = false;
	if (data["currentRun"]["sections"][data["currentRun"]["sections"].length-1].isAfterLastCheckpoint) {
		alc = true;
	}
	for (let elementId of elementIds) {
		document.getElementById(elementId).disabled = !alc;
	}
};

let onChangeInputTiles = function () {
	let isEnteringTilesPerSection = true;
	if (document.getElementById("s5-tile-ids").checked === true) {
		isEnteringTilesPerSection = false;
	}
	document.getElementById("s5-box-warning").style.display = "none";
	document.getElementById("s5-text-warning").innerText = "";
	let txtWarning = "";

	let section;
	for (let i=0; i<data["currentRun"]["sections"].length; i++) {
		section = data["currentRun"]["sections"][i];
		if (section["isAfterLastCheckpoint"]) {
			continue;
		}
		if (isEnteringTilesPerSection) {
			let tiles = +document.getElementById("tiles-section-"+section["sectionId"]).value;
			section.tiles = Math.max(0, tiles);
			if (tiles < 1) {
				txtWarning += " Number of tiles in section " + section["sectionId"] + " too low.";
			}
		} else {
			let tiles = +document.getElementById("tiles-section-"+section["sectionId"]).value
						- (i === 0 ? TILE_ID_OFFSET : +document.getElementById("tiles-section-"+data["currentRun"]["sections"][i-1]["sectionId"]).value);
			section.tiles = Math.max(0, tiles);
			if (tiles < 1) {
				txtWarning += " Tile Id in section " + section["sectionId"] + " must be larger than in previous section.";
			}
		}
	}
	saveDataToLocalStorage();

	if (txtWarning !== "") {
		document.getElementById("s5-text-warning").innerText = "Warning:" + txtWarning;
		document.getElementById("s5-box-warning").style.display = "";
	}
};

let onChangeInputVictims = function () {
	data["currentRun"]["victims"]["deadVictimsBeforeAllLivingVictims"] = Math.max(0, +document.getElementById("victims-dead-before").value);
	data["currentRun"]["victims"]["livingVictims"] = Math.max(0, +document.getElementById("victims-alive").value);
	data["currentRun"]["victims"]["deadVictimsAfterAllLivingVictims"] = Math.max(0, +document.getElementById("victims-dead-after").value);
	saveDataToLocalStorage();
};

let onChangeInputLeftEvacuationZone = function () {
	data["currentRun"]["leftEvacuationZone"] = document.getElementById("left-evacuation-zone").checked;
	saveDataToLocalStorage();
};

let onChangeInputS5TileInput = function () {
	initScreen5();
};

let initScreen6 = function () {
	stopTimeAndCutTo8Minutes();

	updateReviewTable();
	updateReviewAfterLastCheckpoint();
	updateReviewArenaRoundTime();
	updateReviewSummaryOfChanges();
	document.getElementById("review-referee-name").innerHTML = data["currentRun"]["referee"]["name"];
	document.getElementById("review-comments").value = data["currentRun"]["comments"];
	document.getElementById("review-teamname").value = data["currentRun"]["teamname"];
	document.getElementById("review-radio-ok").checked = data["currentRun"]["confirmedByTeamCaptain"];
	document.getElementById("review-radio-complaints").checked = (data["currentRun"]["complaints"] !== "");
	document.getElementById("review-complaints").value = data["currentRun"]["complaints"];
};

let stopTimeAndCutTo8Minutes = function () {
	if (isTimeRunning()) {
		toggleTimeRunning();
	}
	if (getRunTimeInSeconds() > MAX_TIME) {
		data["currentRun"]["originalValues"]["time"] = getRunTimeInSeconds();
		data["currentRun"]["time"]["timeOffset"] = MAX_TIME;
	}
};

let updateReviewTable = function () {
	clearReviewTable();
	addSectionsToReviewTable();
	updateSumInReviewTable();
};

let clearReviewTable = function () {
	let table = document.getElementById("review-table");
	while (table.rows.length > 3) {
		table.deleteRow(1);
	}
	for (let r=1; r<=2; r++) {
		for (let c=1; c<table.rows[r].cells.length; c++) {
			table.rows[r].cells[c].innerHTML = "-";
		}
	}
};

let templateTableCellInput = '<td><input type="number" value="{value}" min="0" onchange="onChangeInputReviewTable(this,{sectionId},\'{element}\')"></td>';
let addSectionsToReviewTable = function () {
	let table = document.getElementById("review-table");
	document.getElementById("tr-alc").style.display = "none";
	let row, section, templ;
	for (let s=0; s<data["currentRun"]["sections"].length; s++) {
		section = data["currentRun"]["sections"][s];
		templ = templateTableCellInput.replace("{sectionId}", section["sectionId"]);
		if (section.isAfterLastCheckpoint) {
			row = table.rows[table.rows.length-2];
			document.getElementById("tr-alc").style.display = "";
		} else {
			row = table.insertRow(table.rows.length-2);
			for (let i=0; i<8; i++) { row.insertCell(i); }
			row.cells[0].innerHTML = section["sectionId"];
			row.cells[1].innerHTML = section["tiles"];
			row.cells[2].innerHTML = templ.replace("{value}", section["lops"]+1).replace("{element}", "lops").replace('min="0"', 'min="1"');
		}
		row.cells[3].innerHTML = templ.replace("{value}", section["gaps"]).replace("{element}", "gaps");
		row.cells[4].innerHTML = templ.replace("{value}", section["obstacles"]).replace("{element}", "obstacles");
		row.cells[5].innerHTML = templ.replace("{value}", section["speedbumps"]).replace("{element}", "speedbumps");
		row.cells[6].innerHTML = templ.replace("{value}", section["ramps"]).replace("{element}", "ramps");
		row.cells[7].innerHTML = templ.replace("{value}", section["intersections"]).replace("{element}", "intersections");
	}
};

let updateSumInReviewTable = function () {
	let table = document.getElementById("review-table");
	let tiles = 0, gaps = 0, obstacles = 0, speedbumps = 0, ramps = 0, intersections = 0;
	for (let s=0; s<data["currentRun"]["sections"].length; s++) {
		section = data["currentRun"]["sections"][s];
		if (section.isAfterLastCheckpoint === false) {
			tiles += section["tiles"];
		}
		gaps          += section["gaps"];
		obstacles     += section["obstacles"];
		speedbumps    += section["speedbumps"];
		ramps         += section["ramps"];
		intersections += section["intersections"];
	}
	
	let lastRow = table.rows[table.rows.length-1];
	lastRow.cells[1].innerHTML = tiles;
	lastRow.cells[3].innerHTML = gaps;
	lastRow.cells[4].innerHTML = obstacles;
	lastRow.cells[5].innerHTML = speedbumps;
	lastRow.cells[6].innerHTML = ramps;
	lastRow.cells[7].innerHTML = intersections;
};

let updateReviewAfterLastCheckpoint = function () {
	document.getElementById("review-after-last-checkpoint-lops").value = data["currentRun"]["sections"][data["currentRun"]["sections"].length-1].lops;
	if (data["currentRun"]["sections"][data["currentRun"]["sections"].length-1].isAfterLastCheckpoint) {
		document.getElementById("review-after-last-checkpoint-lops").disabled = false;
	} else {
		document.getElementById("review-after-last-checkpoint-lops").disabled = true;
	}
	document.getElementById("review-dead-victims-before").innerHTML = data["currentRun"]["victims"]["deadVictimsBeforeAllLivingVictims"];
	document.getElementById("review-living-victims").innerHTML      = data["currentRun"]["victims"]["livingVictims"];
	document.getElementById("review-dead-victims-after").innerHTML  = data["currentRun"]["victims"]["deadVictimsAfterAllLivingVictims"];
	document.getElementById("review-evacuation-point").innerHTML    = data["currentRun"]["evacuationPoint"];;
	document.getElementById("review-left-evacuation-zone").checked = data["currentRun"]["leftEvacuationZone"];
};

let onChangeInputReviewTable = function (domElement, sectionId, scoringElement) {
	let currentValue = data["currentRun"]["sections"][sectionId-1][scoringElement];
	let inputValue = +domElement.value;
	
	if (scoringElement === "lops" && !data["currentRun"]["sections"][sectionId-1]["isAfterLastCheckpoint"]) {
		inputValue -= 1; // user entered number of tries -> lops = tries - 1
	}
	if (inputValue === undefined || inputValue < 0) { return; }
	
	let originalValue = undefined;
	let ovs = data["currentRun"]["originalValues"];
	if (ovs["section"+sectionId] !== undefined) {
		originalValue = ovs["section"+sectionId][scoringElement];
	}
	
	if (inputValue === originalValue) {
		// reset to original value -> delete from originalValues
		data["currentRun"]["sections"][sectionId-1][scoringElement] = inputValue;
		delete ovs["section"+sectionId][scoringElement];
	} else if (inputValue !== currentValue) {
		// set new value and save original value
		data["currentRun"]["sections"][sectionId-1][scoringElement] = inputValue;
		if (originalValue === undefined) {
			// create section if needed and then save original value
			if (ovs["section"+sectionId] === undefined) {
				ovs["section"+sectionId] = {};
			}
			ovs["section"+sectionId][scoringElement] = currentValue;
		}
	}
	
	saveDataToLocalStorage();
	updateSumInReviewTable();
	updateReviewSummaryOfChanges();
};

let onChangeInputReviewLoPsAfterLastCheckpoint = function () {
	onChangeInputReviewTable(document.getElementById("review-after-last-checkpoint-lops"),
							 data["currentRun"]["sections"].length,
							 "lops");
};

let updateReviewArenaRoundTime = function () {
	document.getElementById("review-competition").innerText = convertCompetitionIdToString(data["currentRun"]["competition"]);
	document.getElementById("review-arena").innerText = convertArenaIdToString(data["currentRun"]["arena"]);
	document.getElementById("review-round").innerText = convertRoundIdToString(data["currentRun"]["round"]);
	document.getElementById("review-time").innerText = getRunTimeAsString();
};

let updateReviewSummaryOfChanges = function () {
	let txt = "";
	
	let ovs = data["currentRun"]["originalValues"];
	
	if (ovs["teamname"] !== undefined) {
		let note;
		if (competitions[data["currentRun"]["competition"]] === undefined ||
			competitions[data["currentRun"]["competition"]]["teams"] === undefined ) {
			note = "couldn't load list of teams to check whether team exists or not";
			setTimeout(updateReviewSummaryOfChanges, 1500);
		}
		else if (competitions[data["currentRun"]["competition"]]["teams"].includes(data["currentRun"]["teamname"])) {
			note = "team already exists";
		} else {
			note = "team doesn't exist";
		}
		txt += "<li>Teamname: " + ovs["teamname"] + " &rarr; " + data["currentRun"]["teamname"] + " (" + note + ")</li>";
	}

	if (ovs["time"] !== undefined) {
		if (getSecondsAsTimeString(ovs["time"]) !== getRunTimeAsString()) {
			txt += "<li>Time: " + getSecondsAsTimeString(ovs["time"]) + " &rarr; " + getRunTimeAsString() + "</li>";
		}
	}
	
	let sections = Object.keys(ovs);
	sections.sort();
	for (let i=0; i<sections.length; i++) {
		if (sections[i].startsWith("section")) {
			let elems = Object.keys(ovs[sections[i]]);
			if (elems.length > 0) {
				elems.sort();
				let section = +sections[i].substring("section".length);
				txt += "<li>Section " + section;
				if (data["currentRun"]["sections"][section-1]["isAfterLastCheckpoint"]) { txt += " / ALC"; }
				txt += "<ul>";
				for (let j=0; j<elems.length; j++) {
					let elem = elems[j];
					txt += "<li>";
					txt += elem.charAt(0).toUpperCase() + elem.substring(1);
					txt += ": ";
					txt += ovs["section"+section][elem];
					txt += " &rarr; ";
					txt += data["currentRun"]["sections"][section-1][elem];
					txt += "</li>";
				}
				txt += "</ul></li>";
			}
		}
	}
	
	if (txt === "") {
		txt = "No changes were made";
	} else {
		txt = "<ul>" + txt + "</ul>";
	}
	
	document.getElementById("s6-changes").innerHTML = txt;
};

let onChangeInputReviewComments = function () {
	data["currentRun"]["comments"] = document.getElementById("review-comments").value;
	saveDataToLocalStorage();
};

let onChangeInputReviewTeamname = function () {
	let currentValue = data["currentRun"]["teamname"];
	let inputValue = document.getElementById("review-teamname").value;
	let originalValue = data["currentRun"]["originalValues"]["teamname"];
	
	if (inputValue === originalValue) {
		data["currentRun"]["teamname"] = inputValue;
		delete data["currentRun"]["originalValues"]["teamname"];
	} else {
		data["currentRun"]["teamname"] = inputValue;
		if (originalValue === undefined) {
			data["currentRun"]["originalValues"]["teamname"] = currentValue;
		}
	}
	
	saveDataToLocalStorage();
	updateReviewSummaryOfChanges();
};

let onChangeInputReviewOk = function () {
	if (document.getElementById("review-complaints").value === "") {
		data["currentRun"]["confirmedByTeamCaptain"] = document.getElementById("review-radio-ok").checked;
	} else {
		data["currentRun"]["confirmedByTeamCaptain"] = false;
		document.getElementById("review-radio-complaints").checked = true;
	}
	saveDataToLocalStorage();
};

let onChangeInputReviewRadioComplaints = function () {
	data["currentRun"]["confirmedByTeamCaptain"] = document.getElementById("review-radio-ok").checked;
	saveDataToLocalStorage();
};

let onChangeInputReviewComplaints = function () {
	data["currentRun"]["complaints"] = document.getElementById("review-complaints").value;
	if (document.getElementById("review-complaints").value !== "") {
		data["currentRun"]["confirmedByTeamCaptain"] = false;
		document.getElementById("review-radio-complaints").checked = true;
	}
	saveDataToLocalStorage();
};

let initScreen7 = function () {
	// hide all status icons and messages
	document.getElementById("s7-success").style.display = "none";
	document.getElementById("s7-fail").style.display = "none";
	document.getElementById("s7-not-found").style.display = "none";

	if (data["lastSubmitStatus"] &&
		data["lastSubmitStatus"]["status"] === STATUS_SUCCESSFUL) {
		document.getElementById("s7-success").style.display = "";
	} else if (data["lastSubmitStatus"] &&
				data["lastSubmitStatus"]["status"] === STATUS_FAILED) {
		document.getElementById("s7-fail").style.display = "";
		document.getElementById("s7-error-message-text").innerText = JSON.stringify(data["lastSubmitStatus"]["response"]);
	} else {
		// found no data about last submit
		document.getElementById("s7-not-found").style.display = "";
	}

	if (data["lastSubmitStatus"]) {
		document.getElementById("s7-run-id").innerText = data["lastSubmitStatus"]["runInfo"];
		document.getElementById("s7-run-id-box").style.display = "";
	} else {
		document.getElementById("s7-run-id-box").style.display = "none";
	}
}

let initScreen8 = function () {
	updateS8SettingsInputs();
	initS8RunHistoryList();
};

let updateS8SettingsInputs = function () {
	document.getElementById("event").value = data["event"];
	document.getElementById("submit-host").value = data["submitConfig"]["host"];
	document.getElementById("submit-path").value = data["submitConfig"]["path"];
};

let resetS8SettingsToDefault = function () {
	// TODO: confirm()?
	changeLocalData("event", DEFAULT_EVENT);
	changeLocalData("submitConfig-host", DEFAULT_SUBMIT_HOST);
	changeLocalData("submitConfig-path", DEFAULT_SUBMIT_PATH);

	updateS8SettingsInputs();
};

let onChangeInputSettingsEvent = function () {
	changeLocalData("event", document.getElementById("event").value);
};

let onChangeInputSettingsSubmitHost = function () {
	changeLocalData("submitConfig-host", document.getElementById("submit-host").value);
};

let onChangeInputSettingsSubmitPath = function () {
	changeLocalData("submitConfig-path", document.getElementById("submit-path").value);
};

let btnS8ToggleCurrentRun = function () {
	if (document.getElementById("s8-current-run").style.display === "") {
		// currently displayed -> hide
		document.getElementById("s8-current-run").style.display = "none";
		document.getElementById("btn-s8-current-run").innerText = "Show Current Run";
	} else {
		// currently hidden -> update and show
		let txt = JSON.stringify(data["currentRun"]);
		txt = txt.replace(/,/g, ",<br>");
		txt = txt.replace(/"auth":".*"\},/g, "\"auth\": ---},");
		document.getElementById("s8-current-run").innerHTML = txt;
		document.getElementById("s8-current-run").style.display = "";
		document.getElementById("btn-s8-current-run").innerText = "Hide Current Run";
	}
};

let initS8RunHistoryList = function () {
	let el = document.getElementById("s8-run-history");
	el.innerHTML = "";

	for (let runId in runHistory) {
		let successful = hasRunBeenSubmittedSuccesfully(runId);

		let path = "", alt = "";
		if (successful) {
			path = "img/successful.svg";
			alt = "Successful";
		} else {
			path = "img/failed.svg";
			alt = "Failed";
		}
		el.innerHTML += '<img src="{path}" alt="{alt}" class="s8-run-history-icon" /> '
							.replace("{path}", path)
							.replace("{alt}", alt);
		el.innerHTML += runId;
		el.innerHTML += " (";
		el.innerHTML += runHistory[runId]["scoring"]["score"];
		el.innerHTML += ", ";
		el.innerHTML += "M: [" + String(runHistory[runId]["scoring"]["multipliers"]) + "] = " + String(runHistory[runId]["scoring"]["multiplier"]);
		el.innerHTML += ", ";
		el.innerHTML += getSecondsAsTimeString(runHistory[runId]["time_duration"]);
		el.innerHTML += ")";
		el.innerHTML += "<br>";
	}

	if (el.innerHTML === "") {
		el.innerHTML = "No Runs in Run History";
	}
};

let hasRunBeenSubmittedSuccesfully = function (runId) {
	for (let s of runHistory[runId]["submits"]) {
		if (s.submitStatus === STATUS_SUCCESSFUL) {
			return true;
		}
	}
	return false;
};

let btnS8ExportRunHistory = function () {
	downloadJSON(runHistory, "runHistory-"+(new Date()).toISOString()+".json");
};

function btnS8ExportScores () {
	const scores = {};
	for (const runId in runHistory) {
		const run = runHistory[runId];
		scores[runId] = {
			refereeName: run?.referee?.name,
			competition: run?.competition,
			arena: run?.arena,
			round: run?.round,
			teamname: run?.teamname,
			time_duration: run?.time_duration,
			score: run?.scoring?.score,
			multipliers: run?.scoring?.multipliers,
			multiplier: run?.scoring?.multiplier,
			lastSectionLops: (run?.scoring?.sections || [])[run?.scoring?.sections?.length]?.lops,
			lastSectionAlc: (run?.scoring?.sections || [])[run?.scoring?.sections?.length]?.isAfterLastCheckpoint,
			comments: run?.comments,
			confirmed: run?.confirmed,
			complaints: run?.complaints,
		}
	}
	downloadJSON(scores, "runHistory-scores-"+(new Date()).toISOString()+".json");
}

let downloadJSON = function (object, filename) {
	let hiddenElement = document.createElement("a");
	hiddenElement.href = "data:text/json;charset=utf-8," + encodeURI(JSON.stringify(object));
	hiddenElement.target = "_blank";
	hiddenElement.download = filename;
	hiddenElement.click();
};

let btnS8SubmitAllFailedAgain = function () {
	for (let runId in runHistory) {
		let successful = hasRunBeenSubmittedSuccesfully(runId);
		
		if (!successful) {
			let run = runHistory[runId];
			run["referee"]["name"] = data["referee"]["name"];
			run["referee"]["auth"] = data["referee"]["auth"];
			submitRunAndShowResult(run, true);
		}
	}
};

function btnS8DeleteRunHistory () {
	loadRunHistoryFromLocalStorage();
	if (Object.keys(runHistory).length === 0) return;
	if (!confirm(`Do you really want to delete the run history?`
			+ ` It will be difficult to restore it.`)) return;
	const lsKey = LS_RUN_HISTORY + "-bak-" + String(Date.now());
	localStorage.setItem(lsKey, JSON.stringify(runHistory));
	runHistory = {};
	saveRunHistoryToLocalStorage();
	initS8RunHistoryList();
}

let getRunIdentifier = function (run) {
	if (!run["id"]) {
		const uniqueStr = Math.random().toString(36).slice(2);
		run["id"] = run["competition"] + "-" + run["round"] + "-" + run["arena"] + "-" + run["teamname"] + "-" + uniqueStr;
	}
	return run["id"];
};

let tryToSubmitRun = async function () {
	if (checkWhetherRunCanBeSubmitted() !== true) {
		return false;
	}

	let runSubmit = getRunSubmitObject();

	runHistory[getRunIdentifier(runSubmit)] = runSubmit;
	saveRunHistoryToLocalStorage();

	data["currentRun"] = null;
	saveDataToLocalStorage();

	submitRunAndShowResult(runSubmit);
};

let checkWhetherRunCanBeSubmitted = function () {
	let reviewInputs = document.getElementById("review-table").getElementsByTagName("input");
	for (let i=0; i<reviewInputs.length; i++) {
		if (+reviewInputs[i].value < +reviewInputs[i].min) {
			return false;
		}
	}
	let el = document.getElementById("review-after-last-checkpoint-lops");
	if (+el.value < +el.min) {
		return false;
	}
	
	if ( (data["currentRun"]["confirmedByTeamCaptain"] &&
		  document.getElementById("review-radio-ok").checked) ||
		 (document.getElementById("review-radio-complaints").checked &&
		  document.getElementById("review-complaints").value !== "")) {
		return true;
	}
	return false;
};

let getRunSubmitObject = function () {
	const scoring = calculateScore(data["currentRun"]);
	return {
		referee: cloneObject(data["currentRun"]["referee"]),
		competition: data["event"] + "-" + data["currentRun"]["competition"],
		arena: data["currentRun"]["arena"],
		round: Number(data["currentRun"]["round"].replace(/\D+/g, "")[0]), // replace all non-digits with empty string and cast to int
		teamname: data["currentRun"]["teamname"],
		time_duration: Math.min(MAX_TIME, Math.round(data["currentRun"]["time"]["timeOffset"])),
		time_start: Math.round(data["currentRun"]["time"]["timestampRunStart"]*1000), // convert unix timestamps back to ms
		time_end: Math.round(data["currentRun"]["time"]["timestampRunEnd"]*1000),
		scoring: {
			teamStarted: data["currentRun"]["teamStarted"],
			evacuationPoint: data["currentRun"]["evacuationPoint"],
			sections: cloneObject(data["currentRun"]["sections"]),
			victims: cloneObject(data["currentRun"]["victims"]),
			leftEvacuationZone: data["currentRun"]["leftEvacuationZone"],
			...scoring,
		},
		comments: data["currentRun"]["comments"],
		confirmed: data["currentRun"]["confirmedByTeamCaptain"],
		complaints: data["currentRun"]["complaints"],
		logs: cloneObject(data["currentRun"]["logs"]),
		logsUndone: cloneObject(data["currentRun"]["logsUndone"]),
		originalValues: cloneObject(data["currentRun"]["originalValues"]),
		submits: [],
	};
};

let calculateScore = function (run) {
	let score = 0;

	if (!run["teamStarted"]) {
		return 0;
	} else {
		score += POINTS_TILE_FIRST_TRY;
	}

	for (let section of run["sections"]) {
		if (section["completedSection"]) {
			if (section["lops"] === 0) {
				score += section["tiles"] * POINTS_TILE_FIRST_TRY;
			} else if (section["lops"] === 1) {
				score += section["tiles"] * POINTS_TILE_SECOND_TRY;
			} else if (section["lops"] === 2) {
				score += section["tiles"] * POINTS_TILE_THIRD_TRY;
			}
		}

		score += section["gaps"]          * POINTS_GAP;
		score += section["obstacles"]     * POINTS_OBSTACLE;
		score += section["speedbumps"]    * POINTS_SPEEDBUMP;
		score += section["ramps"]         * POINTS_RAMP;
		score += section["intersections"] * POINTS_INTERSECTION;
	}

	let lopsAfterLastCheckpoint = 0;
	if (run["sections"][run["sections"].length-1]["isAfterLastCheckpoint"]) {
		// if last section is not behind last checkpoint there will also be no victims rescued
		//  -> can safely calculate deduction based on last section
		lopsAfterLastCheckpoint = run["sections"][run["sections"].length-1]["lops"];
	}

	function float(f, prec=10) {
		return parseFloat(parseFloat(f).toFixed(prec));
	}
	function get_multiplier(multiplier, count, deduction) {
		return float(Math.max(1, Math.max(1, multiplier - deduction) ** count));
	}

	const multipliers = [];

	if (run["competition"] === COMPETITION_ENTRY) {
		const lv = run["victims"]["livingVictims"];
		const dv = run["victims"]["deadVictimsBeforeAllLivingVictims"] + run["victims"]["deadVictimsAfterAllLivingVictims"];
		const deduction = 0.05 * lopsAfterLastCheckpoint;

		multipliers.push(get_multiplier(1.4, lv, deduction));
		if (dv > 0) {
			if (lv == 0) {
				multipliers.push(get_multiplier(1.2, dv, deduction));
			} else {
				multipliers.push(get_multiplier(1.4, dv, deduction));
			}
		}
	} else if (run["competition"] === COMPETITION_LINE) {
		const lv = run["victims"]["livingVictims"];
		const dv = run["victims"]["deadVictimsBeforeAllLivingVictims"] + run["victims"]["deadVictimsAfterAllLivingVictims"];
		const deduction = (run["evacuationPoint"] === "low" ? 0.025 : 0.05) * lopsAfterLastCheckpoint;

		if (run["evacuationPoint"] === "low") {
			multipliers.push(get_multiplier(1.2, lv, deduction));
			if (lv == 2) multipliers.push(get_multiplier(1.2, dv, deduction));
		} else if (run["evacuationPoint"] === "high") {
			multipliers.push(get_multiplier(1.4, lv, deduction));
			if (lv == 2) multipliers.push(get_multiplier(1.4, dv, deduction));
		}
	}

	/*if (run["competition"] === COMPETITION_LINE && run["leftEvacuationZone"]) {
		score += POINTS_FINDING_LINE;
	}*/

	const multiplier = float(multipliers.reduce((total, cur) => total * cur, 1));
	return { score, multipliers, multiplier };
};

let submitRunAndShowResult = function (runSubmit, showResultOnlyInRunHistory) {
	if (showResultOnlyInRunHistory === undefined) { showResultOnlyInRunHistory = false; }
	let url = data["submitConfig"]["host"] + data["submitConfig"]["path"];
	let runId = getRunIdentifier(runSubmit);

	fetch(url, {
		method: 'POST',
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': 'Basic ' + btoa(runSubmit["referee"]["name"] + ":" + runSubmit["referee"]["auth"])
		},
		body: JSON.stringify(runSubmit)
	})
	.then(async function (response) {
		let text = await response.text();
		if (response.status === 200 || response.status === 201) {
			changeLocalData("lastSubmitStatus-status", STATUS_SUCCESSFUL);
			changeLocalData("lastSubmitStatus-response", text);
			changeLocalData("lastSubmitStatus-runInfo", runId);

			runHistory[runId]["submits"].push({ time: getTime(), submitStatus: STATUS_SUCCESSFUL, response: text });
		} else {
			throw text;
		}
	})
	.catch((error) => {
		changeLocalData("lastSubmitStatus-status", STATUS_FAILED);
		changeLocalData("lastSubmitStatus-response", error.toString());
		changeLocalData("lastSubmitStatus-runInfo", runId);

		runHistory[runId]["submits"].push({ time: getTime(), submitStatus: STATUS_FAILED, response: error.toString() });
	})
	.finally(() => {
		saveDataToLocalStorage();
		saveRunHistoryToLocalStorage();
		if (showResultOnlyInRunHistory) {
			initS8RunHistoryList();
		} else {
			// the submit result will be displayed by init function of screen 7 automatically
			changeScreen(6, 7);
		}
	});
};

let addScoringElement = function (name) {
	highlightAddScoringElement(name);
	getCurrentSection()[name+"s"] += 1;
	writeLog(LOG_ADD_PREFIX + " " + name.toUpperCase());
	
	saveDataToLocalStorage();
	setCaptionForScoringElement(name);
};

let undoAddScoringElement = function (name) {
	highlightRemoveScoringElement(name);
	getCurrentSection()[name+"s"] -= 1;
	
	saveDataToLocalStorage();
	setCaptionForScoringElement(name);
	return true;
};

let highlightAddScoringElement = function (name) {
	addClassForShortTimeToParent("img-"+name, "active-add");
};

let highlightRemoveScoringElement = function (name) {
	addClassForShortTimeToParent("img-"+name, "active-del");
};

let elementsWithTimeoutsForShortTimeClasses = {}; // elementId -> timeoutId
let addClassForShortTimeToParent = function (elementId, className, timeInMs) {
	let element = document.getElementById(elementId).parentElement;
	clearTimeout(elementsWithTimeoutsForShortTimeClasses[elementId]);
	element.classList.add(className);
	let timeoutId = setTimeout(() => {
		element.classList.remove(className);
	}, Math.min(500, timeInMs || 200)); // 200 is default, 500 is max value
	elementsWithTimeoutsForShortTimeClasses[elementId] = timeoutId;
	// TODO: concurrency - read/clear/save could fail
};

let removeScoringElement = function (name) {
	if (getCurrentSection()[name+"s"] > 0) {
		highlightRemoveScoringElement(name);
		getCurrentSection()[name+"s"] -= 1;
		writeLog(LOG_DEL_PREFIX + " " + name.toUpperCase());
	}
	
	saveDataToLocalStorage();
	setCaptionForScoringElement(name);
};

let undoRemoveScoringElement = function (name) {
	highlightAddScoringElement(name);
	getCurrentSection()[name+"s"] += 1;
	
	saveDataToLocalStorage();
	setCaptionForScoringElement(name);
	return true;
};

let sectionComplete = function () {
	if (!isAllowedToComplete()) {
		showNotification("You can't complete a section after last checkpoint", 1500);
		return;
	}
	addClassForShortTimeToParent("s4-btn-section-complete", "active-add");
	getCurrentSection().completedSection = true;
	createNewSection();
	writeLog(LOG_SECTION_COMPLETE);
	
	saveDataToLocalStorage();
	updateUIElementsS4();
};

let undoSectionComplete = function () {
	addClassForShortTimeToParent("s4-btn-section-complete", "active-del");
	data["currentRun"]["sections"].pop();
	getCurrentSection().completedSection = false;
	
	saveDataToLocalStorage();
	updateUIElementsS4();
	return true;
};

let sectionLoP = function () {
	addClassForShortTimeToParent("s4-btn-section-lop", "active-add");
	getCurrentSection().lops += 1;
	writeLog(LOG_LOP);
	
	saveDataToLocalStorage();
	updateUIElementsS4();
};

let undoSectionLoP = function () {
	addClassForShortTimeToParent("s4-btn-section-lop", "active-del");
	getCurrentSection().lops -= 1;
	
	saveDataToLocalStorage();
	updateUIElementsS4();
	return true;
};

let sectionSkip = function () {
	if (!isAllowedToSkip()) {
		showNotification("Skipping is only allowed after 3 attempts", 1500);
		return;
	}
	addClassForShortTimeToParent("s4-btn-section-skip", "active-add");
	getCurrentSection().lops += 1;
	getCurrentSection().skippedSection = true;
	createNewSection();
	writeLog(LOG_SKIP_SECTION);
	
	saveDataToLocalStorage();
	updateUIElementsS4();
};

let undoSectionSkip = function () {
	addClassForShortTimeToParent("s4-btn-section-skip", "active-del");
	data["currentRun"]["sections"].pop();
	getCurrentSection().skippedSection = false;
	getCurrentSection().lops -= 1;
	
	saveDataToLocalStorage();
	updateUIElementsS4();
	return true;
};

let toggleLastCheckpoint = function () {
	getCurrentSection()["isAfterLastCheckpoint"] = !getCurrentSection()["isAfterLastCheckpoint"];
	writeLog(LOG_LAST_CHECKPOINT);
	
	saveDataToLocalStorage();
	updateUIElementsS4();
};

let undoToggleLastCheckpoint = function () {
	getCurrentSection()["isAfterLastCheckpoint"] = !getCurrentSection()["isAfterLastCheckpoint"];
	
	saveDataToLocalStorage();
	updateUIElementsS4();
	return true;
};

let showWarningIfTimeIsNotRunning = function () {
	if (!isTimeRunning()) {
		showNotification("WARNING: Time is not running!", 3000);
	}
};

let showWarningIfTimeIsOver = function () {
	if (getRunTimeInSeconds() > MAX_TIME) {
		showNotification("WARNING: Time is over!", 3000);
	}
};

let showNotification = function (notification, maxDuration) {
	// clear timeout if exists
	if (timeoutIdNotification !== null) {
		clearTimeout(timeoutIdNotification);
		timeoutIdNotification = null;
	}
	
	// show notification
	document.getElementById("txt-notification").innerHTML = notification;
	
	// set timeout to clear notification
	if (maxDuration !== undefined) {
		timeoutIdNotification = setTimeout(function () {
			document.getElementById("txt-notification").innerHTML = "";
		}, maxDuration);
	}
};

let writeLog = function (log) {
	showWarningIfTimeIsNotRunning();
	showWarningIfTimeIsOver();
	data["currentRun"]["logs"].push({
		time: getRunTimeInSeconds(),
		log: log,
	});
	
	updateUndoButton();
};

let moveLastLogToUndoneLogs = function () {
	let lastLog = data["currentRun"]["logs"][data["currentRun"]["logs"].length - 1];
	lastLog["timeUndone"] = getRunTimeInSeconds();
	
	data["currentRun"]["logsUndone"].push(lastLog);
	data["currentRun"]["logs"].pop();
	
	updateUndoButton();
	saveDataToLocalStorage();
};

let undoLastLog = function () {
	if (!isUndoPossible()) {
		return;
	}
	
	let undoFunction = null;
	let undoFunctionArgument = undefined;
	let lastLog = data["currentRun"]["logs"][data["currentRun"]["logs"].length - 1].log;
	
	if (lastLog === LOG_SECTION_COMPLETE) {
		undoFunction = undoSectionComplete;
	} else if (lastLog === LOG_LOP) {
		undoFunction = undoSectionLoP;
	} else if (lastLog === LOG_SKIP_SECTION) {
		undoFunction = undoSectionSkip;
	} else if (lastLog.startsWith(LOG_ADD_PREFIX)) {
		undoFunction = undoAddScoringElement;
		undoFunctionArgument = lastLog.substring(LOG_ADD_PREFIX.length + 1).toLowerCase();
	} else if (lastLog.startsWith(LOG_DEL_PREFIX)) {
		undoFunction = undoRemoveScoringElement;
		undoFunctionArgument = lastLog.substring(LOG_DEL_PREFIX.length + 1).toLowerCase();
	} else if (lastLog === LOG_LAST_CHECKPOINT) {
		undoFunction = undoToggleLastCheckpoint;
	}
	
	if (undoFunction !== null && undoFunction(undoFunctionArgument)) {
		moveLastLogToUndoneLogs();
	}
};

let isUndoPossible = function () {
	return data["currentRun"]["logs"].length > 0;
};

let updateUndoButton = function () {
	if (isUndoPossible()) {
		document.getElementById("s4-btn-undo").classList.remove("disabled");
	} else {
		document.getElementById("s4-btn-undo").classList.add("disabled");
	}
};

let initializeInputs = function () {
	document.getElementById("referee-name").value = data["referee"]["name"];
	document.getElementById("referee-password").value = data["referee"]["auth"];
	document.getElementById("competition").value = data["competition"];
	
	let arena = data["arena"]; // data["arena"] will be overwritten by initializing competition-input with onChangeInputCompetition()
	let round = data["round"]; // ... same here ...
	let run = null; // ... same here ...
	if (data["currentRun"] !== null) {
		run = data["currentRun"];
	}
	
	onChangeInputCompetition();
	
	changeLocalData("arena", arena);
	changeLocalData("round", round);
	
	document.getElementById("arena").value = data["arena"];
	document.getElementById("s3-arena").value = data["arena"];
	document.getElementById("round").value = data["round"];
	
	if (run !== null) {
		data["currentRun"] = run;
		
		updateUIElementsForRun();
		initializeTime();
	}
	
	saveDataToLocalStorage();
};

let readCredentialsFromURLIfSupplied = function () {
	let cred = url.searchParams.get("cred");
	if (cred) {
		cred = atob(cred);
		let ix = cred.indexOf(":");
		let name = cred.substring(0, ix);
		let password = cred.substring(ix+1);

		changeLocalData("referee-name", name);
		changeLocalData("referee-auth", password);
		document.getElementById("referee-name").value = data["referee"]["name"];
		document.getElementById("referee-password").value = data["referee"]["auth"];
	}
};

let showVersionInS8 = async function () {
	try {
		let c = await caches.keys();
		let cacheName = c[0];
		document.getElementById("s8-version").innerText = cacheName.split("_",2)[1];
	} catch (err) {
		document.getElementById("s8-version").innerText = "version unknown";
	}
};

/*let btnReload = function () {
	window.location.reload(true);
};*/

// sounds - credit goes to https://stackoverflow.com/a/41077092
audioCtx = new(window.AudioContext || window.webkitAudioContext)();

let beep = function (frequency, duration, volume, type) {
  var oscillator = audioCtx.createOscillator();
  var gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  gainNode.gain.value = volume;
  oscillator.frequency.value = frequency;
  oscillator.type = type;

  oscillator.start();

  setTimeout(
    function() {
      oscillator.stop();
    },
    duration
  );
};

let fiveSecondCountdown = function () {
	shortBeep();
	let i = setInterval(shortBeep, 1000);
	setTimeout(function () { clearInterval(i); }, 4200);
	setTimeout(function () { longBeep(); }, 5000);
};
