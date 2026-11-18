'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  mulberry32,
  trainTextClassifier,
  predictText,
  trainTabularClassifier,
  predictTabular,
  evaluateClassifier
} = require('./ml.cjs');

const MODEL_DIR = path.join(__dirname, 'model');

// ------------------------------------------------------------------
// 1. Source & Schema Classifier (Sherlock Ohms)
// ------------------------------------------------------------------
function buildSourceDataset() {
  const groups = {
    reservations: {
      train: [
        'Reservation ID Resource name Reserved by Lab name Billing account Start date time End date time Service type User type Reservation status',
        'Booking ID Equipment name User full name Research lab Account code Start timestamp End timestamp Service type Rate tier Event status',
        'System User login User full name Account Group Date From To State Type',
        'Event Type Schedule Resource Name Scheduled Start Time Scheduled End Time Customer Name Customer Email Customer Lab Payment Information',
        'Reservation ID Resource Owner Lab Account Start End Reservation type User type Status',
        'Res ID Instrument Operator PI PTA Start Date Start Time End Date End Time Status',
        'Booking Number Core Asset Booked By Department Worktag Begin Time Finish Time Usage Mode Membership Tier',
        'Schedule Export FBS Confocal microscope Confirmed Self-service Internal',
        'iLab calendar reservation export sheet equipment booking schedule confirmed cancelled',
        'PPMS booking list system date from to user group account',
        'Booked Scheduler reservation export csv resource member start end',
        'QReserve asset calendar export reservation id user status start end',
        'Infinity Idea Elan reservation report instrument customer pi account status',
        'Confirmed Cancelled No-show reservation calendar booking slot schedule export',
        'Resource Owner Start End Service Type Account Code Reservation Status',
        'Equipment Calendar Bookings October Month Schedule Export CSV',
        'Core facility schedule bookings export reservations table header',
        'Instrument reservation report rows booked time user lab funding code',
        'Booking start end status confirmed cancelled resource equipment operator',
        'Facility calendar schedule reservation identifier pi grant code'
      ],
      heldout: [
        'Facility Booking Export Resource Name Booked By Principal Investigator Funding Grant Start Timestamp End Timestamp Booking State',
        'iLab Reservation Report Schedule Asset Customer Full Name Research Group Payment Info Scheduled Start Scheduled End Status',
        'PPMS Schedule Table System Operator Login Group Account Date Time From Time To Reservation State',
        'Monthly core calendar bookings xlsx resource user lab account confirmed cancelled',
        'Confocal and cytometer booking export start time end time service tier status'
      ]
    },
    usage_log: {
      train: [
        'Workstation Username Logon Time Logoff Time Duration Active Software open Source',
        'Instrument User Full Name Timestamp Record Login Logout Event',
        'Computer Name Windows User Session Start Session End Keyboard Active App Open',
        'PC Workstation Login Logoff Confocal-PC Flow-PC Acquisition Software Log',
        'Parity Collector workstation username logon logoff active minutes software open',
        'Windows security event logon logoff 4624 4634 workstation operator timestamp',
        'Instrument PC usage session log login successful logout event timestamp',
        'Lab workstation session telemetry username logon time logoff time',
        'Computer login audit trail workstation user full name record login logout',
        'Active input minutes instrument program open workstation pc usage csv',
        'Operator workstation login logoff duration minutes csv export',
        'Client PC login session trace user account logon logoff timestamp',
        'Desktop usage tracker workstation operator logon logoff active time',
        'Instrument computer session records start end user workstation',
        'Microscope PC windows logon logoff session duration software running',
        'Backfill windows event log logon logoff workstation operator',
        'PC console login event timestamp record login logout',
        'Shared workstation session log operator logon logoff minutes',
        'Acquisition PC login logoff timestamps keyboard mouse activity',
        'Workstation usage csv user login logout session trace'
      ],
      heldout: [
        'Instrument Console Workstation Windows Account Logon Timestamp Logoff Timestamp Active Min Program Open',
        'Microscope PC Event Log Operator Name Event Timestamp Action Login Logout',
        'Core PC usage tracking CSV computer name username session start session end',
        'Backfill workstation logon logoff security event export',
        'Acquisition computer active keyboard minutes software open session log'
      ]
    },
    power_telemetry: {
      train: [
        'Plug ID Instrument Timestamp Watts Volts Amps Power State Duty Cycle',
        'Smart plug telemetry stream watts power draw milliamps idle active run',
        'Wall outlet power meter confocal microscope watts rms voltage current',
        'Instrument smart socket kasa shelly watts telemetry csv timestamp',
        'Power draw time series watts standby idle laser active acquisition off',
        'Outlet sensor reading instrument_id start end mean_watts peak_watts state',
        'Smart plug wattage log 248W active laser 38W standby 3W off',
        'Wattmeter interval telemetry instrument power draw amperes voltage',
        'AC power monitor sample watts rms current duty cycle instrument',
        'Plug sensor active acquisition interval mean watts peak watts std watts',
        'Lab outlet power sensor stream csv timestamp watts state confidence',
        'Smart plug logger watts off standby_idle active_acquisition sensor_dropout',
        'Electrical load sensor flow cytometer mass spec power telemetry watts',
        'Energy monitor outlet reading watts baseline standby active laser run',
        'Wall plug power signature time series mean_watts peak_watts duty_cycle',
        'Telemetry watt samples sensor gap dropout missing packets watts',
        'Power strip smart outlet channel watts voltage power factor',
        'Instrument mains power log watts standby active acquisition interval',
        'Plug telemetry interval dataset mean watts peak watts pc active ratio',
        'Smart outlet power trace csv instrument watts timestamp'
      ],
      heldout: [
        'Smart Outlet Sensor Telemetry Device Instrument Timestamp Mean Watts Peak Watts Duty Cycle',
        'Power Plug Wattmeter CSV Flow Cytometer RMS Watts Current Voltage State',
        'Wall Socket Power Draw Interval Series Active Acquisition Standby Idle Off Dropout',
        'Laboratory outlet energy monitor watts time series export',
        'Mains power plug telemetry log peak watts baseline standby laser load'
      ]
    },
    price_sheet: {
      train: [
        'Service Unit Internal rate External academic rate Commercial rate After hours',
        'Core Facility Rates Flow cytometer Self-service per hour $60 $96 $150',
        'Instrument Pricing Table Assisted Training Internal External Industry Hourly Rate',
        'Price sheet hourly rates tiers rounding 30-minute increments after hours weekend',
        'Rate card confocal microscope self assisted training per hour $40 $80 $128',
        'Fee schedule internal academic external nonprofit commercial for-profit rate',
        'Core billing policy billed in 30-minute steps after hours weekdays after 6 PM',
        'Service rates list machine mode unit internal price external price corporate price',
        'Mass spectrometer hourly fee self-service assisted training cancellation policy',
        'Cell sorter price list $110/hr self-service $165/hr assisted $275 commercial',
        'Sample prep per sample $12 $20 $30 hourly rate card',
        'Core facility fee schedule tariff internal campus outside academic industry',
        'After-hours discount rate evening weekend hourly price table',
        'Minimum charge billing increment 15 min 30 min cancellation fee 50%',
        'User tier pricing table internal member external academic commercial rate',
        'Pricing rules sheet hourly charge per sample per run fee card',
        'Equipment rate sheet microscope cytometer sorter tariff USD per hour',
        'Published core rates internal rate external rate corporate rate footnotes',
        'Cost recovery rate card hourly fees tiers rounding policy notes',
        'Shared facility tariff sheet service modes rates billing increment'
      ],
      heldout: [
        'Core Fee Schedule Instrument Service Mode Unit Campus Rate Academic External Commercial Hourly',
        'Equipment Tariff Sheet Confocal Self-service $45/hr Assisted $95/hr After Hours $35/hr',
        'Rate Card Export Internal Tier External Tier Corporate Tier Rounding 15-Minute Increments',
        'Facility Price List Per Hour Per Sample Cancellation Policy After Hours Weekend Rules',
        'Microscopy Core Billing Rates USD per hour Member Visitor Industry'
      ]
    },
    unrelated_notes: {
      train: [
        'Remember to email the dean about the annual budget and lab holiday schedule',
        'Meeting notes Friday 2 PM pizza seminar room B204 agenda items',
        'Lab safety inspection checklist fire extinguisher eyewash station signed',
        'Supply order pipette tips gloves falcon tubes buffer reagents vendor quote',
        'Welcome onboarding guide badge access building keys parking permit instructions',
        'Vacation calendar out of office coverage August conference travel itinerary',
        'Equipment maintenance vendor contact phone number serial number warranty pdf',
        'Weekly journal club paper discussion slides PDF presentation links',
        'Biohazard waste pickup schedule Tuesday hallway bin protocol',
        'Door code instructions fridge freezer temperature manual log checklist',
        'Staff directory emergency contacts building manager campus security',
        'Software license renewal memo IT ticket number workstation update',
        'Grant proposal narrative draft aims figures bibliography references',
        'Graduate student rotation schedule lab lunch signup sheet',
        'Cryo tank liquid nitrogen fill log delivery receipt invoice',
        'Cleanroom gowning SOP protocol safety training quiz answers',
        'Seminar speaker travel reimbursement hotel flight receipt notes',
        'Annual core advisory committee meeting minutes slide deck',
        'Random readme text notes scratchpad todo list reminders',
        'Faculty senate memo campus parking construction alert notice'
      ],
      heldout: [
        'Lab meeting minutes Tuesday agenda supply reorder gloves and tips reminder',
        'Safety walkthrough inspection notes eyewash station and biosafety cabinet',
        'Conference travel itinerary flight confirmation hotel receipt budget memo',
        'Graduate student desk assignment and keycard access request notes',
        'Liquid nitrogen delivery schedule and hallway maintenance notice'
      ]
    }
  };

  // Expand slightly with clean variations so vocabulary generalizes smoothly
  const train = [], heldout = [];
  for (const [label, split] of Object.entries(groups)) {
    for (const base of split.train) {
      train.push({ text: base, label });
      train.push({ text: base.toLowerCase(), label });
    }
    for (const text of split.heldout) heldout.push({ text, label });
  }
  return { train, heldout };
}

// ------------------------------------------------------------------
// 2. Column Header Mapper (Sir Slots-a-Lot)
// ------------------------------------------------------------------
function buildColumnDataset() {
  const aliases = {
    id: {
      train: [
        'reservation id', 'booking id', 'reservation number', 'booking number',
        'reservation identifier', 'booking identifier', 'res id', 'event id',
        'record id', 'session id', 'appointment id', 'ref number', 'booking ref',
        'reservation code', 'schedule id', 'ticket id', 'order id', 'entry id',
        'reservation #', 'booking #'
      ],
      heldout: [
        'reservation id export', 'booking id field', 'res reference number',
        'unique booking identifier', 'appointment reference id'
      ]
    },
    resource: {
      train: [
        'resource name', 'equipment name', 'instrument name', 'resource',
        'equipment', 'instrument', 'facility resource', 'machine name',
        'system name', 'asset name', 'device name', 'workstation',
        'microscope name', 'core instrument', 'schedule resource', 'lab equipment',
        'shared resource', 'tool name', 'analyzer name', 'system'
      ],
      heldout: [
        'resource name export', 'equipment name field', 'scheduled instrument name',
        'core facility resource', 'lab machine asset'
      ]
    },
    user: {
      train: [
        'reserved by', 'booked by', 'user name', 'user full name',
        'customer name', 'requested by', 'reservation owner', 'booking owner',
        'operator name', 'researcher', 'researcher name', 'user login',
        'customer email', 'member name', 'operator', 'owner',
        'person name', 'requester', 'user', 'scientist name'
      ],
      heldout: [
        'reserved by export', 'booked by field', 'researcher full name',
        'equipment operator name', 'booking customer name'
      ]
    },
    start: {
      train: [
        'start date time', 'start timestamp', 'start time', 'begin time',
        'booking start', 'reservation start', 'begin timestamp', 'starts at',
        'scheduled start time', 'actual start time', 'start date', 'from time',
        'check in time', 'session start', 'logon time', 'start',
        'date from', 'time start', 'booked from', 'start dt'
      ],
      heldout: [
        'start date time export', 'start timestamp field', 'scheduled begin time',
        'reservation check in timestamp', 'booking start datetime'
      ]
    },
    end: {
      train: [
        'end date time', 'end timestamp', 'end time', 'finish time',
        'booking end', 'reservation end', 'finish timestamp', 'ends at',
        'scheduled end time', 'actual end time', 'end date', 'to time',
        'check out time', 'session end', 'logoff time', 'end',
        'date to', 'time end', 'booked until', 'end dt'
      ],
      heldout: [
        'end date time export', 'end timestamp field', 'scheduled finish time',
        'reservation check out timestamp', 'booking end datetime'
      ]
    },
    status: {
      train: [
        'reservation status', 'booking status', 'status', 'reservation state',
        'booking state', 'event status', 'record status', 'current status',
        'state', 'approval status', 'confirmation status', 'cancellation status',
        'session status', 'appointment status', 'outcome status', 'booking outcome',
        'res status', 'schedule status', 'active state', 'workflow state'
      ],
      heldout: [
        'reservation status export', 'booking status field', 'current booking state',
        'reservation confirmation state', 'appointment status code'
      ]
    },
    lab: {
      train: [
        'lab name', 'research group', 'principal investigator', 'lab',
        'group name', 'research lab', 'pi lab', 'customer lab',
        'pi name', 'department', 'faculty lab', 'investigator lab',
        'research team', 'lab group', 'pi group', 'core lab',
        'sponsoring lab', 'laboratory', 'home lab', 'group'
      ],
      heldout: [
        'lab name export', 'research group field', 'principal investigator lab',
        'affiliated research lab', 'customer pi group'
      ]
    },
    account: {
      train: [
        'account code', 'billing account', 'funding code', 'account',
        'grant code', 'project account', 'funding account', 'billing code',
        'pta', 'worktag', 'worktag string', 'payment info',
        'payment information', 'chartfield', 'fund number', 'cost center',
        'grant number', 'speedtype', 'budget code', 'project code'
      ],
      heldout: [
        'account code export', 'billing account field', 'grant funding number',
        'billing payment worktag', 'research project code'
      ]
    },
    service: {
      train: [
        'service type', 'reservation type', 'service', 'usage type',
        'booking type', 'service mode', 'training service', 'instrument service',
        'usage mode', 'assistance level', 'access mode', 'mode',
        'assisted or self', 'service category', 'session type', 'operation mode',
        'staff assistance', 'service option', 'activity type', 'charge type'
      ],
      heldout: [
        'service type export', 'reservation type field', 'instrument usage mode',
        'booking assistance type', 'facility service category'
      ]
    },
    tier: {
      train: [
        'user type', 'rate tier', 'customer type', 'membership type',
        'affiliation type', 'pricing tier', 'customer tier', 'user affiliation',
        'tier', 'rate category', 'billing tier', 'member type',
        'academic tier', 'client tier', 'fee tier', 'institution tier',
        'internal or external', 'rate group', 'price tier', 'affiliation'
      ],
      heldout: [
        'user type export', 'rate tier field', 'customer billing tier',
        'institution pricing category', 'user affiliation tier'
      ]
    }
  };

  const train = [], heldout = [];
  for (const [label, split] of Object.entries(aliases)) {
    for (const text of split.train) train.push({ text, label });
    for (const text of split.heldout) heldout.push({ text, label });
  }
  return { train, heldout };
}

// ------------------------------------------------------------------
// 3. Smart-Plug Power State Classifier (Count Wattula)
// ------------------------------------------------------------------
const POWER_FEATURES = ['mean_watts', 'peak_watts', 'std_watts', 'duty_cycle', 'duration_min', 'pc_active_ratio'];

function buildPowerDataset() {
  const rTrain = mulberry32(1031);
  const rTest = mulberry32(9903);
  const between = (rnd, lo, hi) => lo + rnd() * (hi - lo);

  function sample(rnd, label) {
    if (label === 'off') {
      return {
        label,
        features: [
          between(rnd, 0.4, 7.5),
          between(rnd, 1.0, 11.0),
          between(rnd, 0.1, 1.6),
          between(rnd, 0.0, 0.05),
          between(rnd, 15, 720),
          between(rnd, 0.0, 0.04)
        ]
      };
    }
    if (label === 'standby_idle') {
      // Instrument warmed up / PC copying files (20-68W, low duty cycle, PC often active)
      return {
        label,
        features: [
          between(rnd, 22, 68),
          between(rnd, 30, 92),
          between(rnd, 2.0, 12.0),
          between(rnd, 0.08, 0.34),
          between(rnd, 15, 180),
          between(rnd, 0.25, 0.95)
        ]
      };
    }
    if (label === 'active_acquisition') {
      // Laser / pump / detector active acquisition (140-480W, high duty cycle, sustained)
      const mean = between(rnd, 150, 440);
      return {
        label,
        features: [
          mean,
          mean + between(rnd, 20, 130),
          between(rnd, 12, 65),
          between(rnd, 0.65, 1.0),
          between(rnd, 15, 360),
          between(rnd, 0.45, 1.0)
        ]
      };
    }
    // sensor_dropout: short glitch / missing packets / negative or flat invalid zero while PC active
    return {
      label: 'sensor_dropout',
      features: [
        between(rnd, 0.0, 1.2),
        between(rnd, 0.0, 2.0),
        between(rnd, 0.0, 0.15),
        between(rnd, 0.0, 0.02),
        between(rnd, 1, 12),
        between(rnd, 0.65, 1.0)
      ]
    };
  }

  const labels = ['off', 'standby_idle', 'active_acquisition', 'sensor_dropout'];
  const train = [], heldout = [];
  for (const label of labels) {
    for (let i = 0; i < 70; i++) train.push(sample(rTrain, label));
    for (let i = 0; i < 18; i++) heldout.push(sample(rTest, label));
  }
  return { train, heldout };
}

// ------------------------------------------------------------------
// 4. Booking-to-Usage Session Matcher (Dr. Venn)
// ------------------------------------------------------------------
const MATCHER_FEATURES = [
  'same_instrument',
  'temporal_iou',
  'start_diff_norm',
  'end_diff_norm',
  'user_handle_match',
  'user_trigram_dice',
  'same_day'
];

function buildMatcherDataset() {
  const rTrain = mulberry32(2047);
  const rTest = mulberry32(8841);
  const between = (rnd, lo, hi) => lo + rnd() * (hi - lo);

  function sample(rnd, label) {
    if (label === 'matched') {
      return {
        label,
        features: [
          1,
          between(rnd, 0.45, 1.0),
          between(rnd, 0.0, 0.25),
          between(rnd, 0.0, 0.45),
          rnd() > 0.1 ? 1 : 0,
          between(rnd, 0.65, 1.0),
          1
        ]
      };
    }
    if (label === 'ambiguous_review') {
      // Shared lab login, shifted window, or partial trigram match
      return {
        label,
        features: [
          1,
          between(rnd, 0.15, 0.55),
          between(rnd, 0.18, 0.65),
          between(rnd, 0.2, 0.75),
          0,
          between(rnd, 0.15, 0.58),
          1
        ]
      };
    }
    // unmatched: wrong instrument, wrong day, or zero overlap
    const wrongInst = rnd() > 0.45 ? 0 : 1;
    return {
      label: 'unmatched',
      features: [
        wrongInst,
        between(rnd, 0.0, 0.06),
        between(rnd, 0.7, 1.0),
        between(rnd, 0.7, 1.0),
        0,
        between(rnd, 0.0, 0.25),
        wrongInst === 0 ? (rnd() > 0.5 ? 1 : 0) : 0
      ]
    };
  }

  const labels = ['matched', 'ambiguous_review', 'unmatched'];
  const train = [], heldout = [];
  for (const label of labels) {
    for (let i = 0; i < 80; i++) train.push(sample(rTrain, label));
    for (let i = 0; i < 20; i++) heldout.push(sample(rTest, label));
  }
  return { train, heldout };
}

// ------------------------------------------------------------------
// 5. Rate & Policy Clause Classifier (Baron Von Markup)
// ------------------------------------------------------------------
function buildPolicyDataset() {
  const groups = {
    mode_self: {
      train: [
        'Self-service unassisted user operated instrument access per hour',
        'Independent walk-up self serve booking rate',
        'Self-service laser run operator-free billing tier',
        'User operated confocal self service hourly rate',
        'Unassisted cytometer usage self-service tariff',
        'Independent researcher self-operated instrument rate',
        'Self serve machine rate without staff operator',
        'Walk-up self-service hourly fee after hours',
        'Autonomous user self-service booking category',
        'Self-operated flow analyzer unassisted rate',
        'Standard self-service per hour charge',
        'No technician self service access rate',
        'Self-serve benchtop usage rate',
        'Independent user self-service session fee',
        'Unassisted microscopy self-service price',
        'Self service instrument booking mode',
        'User-run unassisted equipment access',
        'Independent self-serve rate card entry',
        'Trained user self-service hourly fee',
        'Self-service booking without staff support'
      ],
      heldout: [
        'Unassisted independent user-operated hourly instrument rate',
        'Self-serve microscope access without technician assistance',
        'Self-service walk-up facility rate per hour',
        'User operated self service instrument mode',
        'Operator-free independent booking rate tier'
      ]
    },
    mode_assisted: {
      train: [
        'Assisted staff-assisted technician run full-service rate',
        'Operator-assisted instrument run per hour fee',
        'Full service core staff operated acquisition rate',
        'Technician assisted cell sorting hourly charge',
        'Staff run confocal imaging assisted service',
        'Core specialist operated assisted session rate',
        'Assisted mode with staff technician support',
        'Staff-assisted hourly service fee card',
        'Operator assisted mass spec run pricing',
        'Dedicated technician assisted acquisition mode',
        'Assisted session billed at staff rate',
        'Full-service operator run hourly tariff',
        'Core staff assisted booking category',
        'Assisted usage with technical operator',
        'Staff-supported instrument operation rate',
        'Technician-run assisted service tier',
        'Assisted equipment reservation hourly rate',
        'Operator-led assisted instrument run',
        'Staff-assisted sorting and imaging fee',
        'Assisted service mode billing rate'
      ],
      heldout: [
        'Staff-operated full-service technician assisted hourly rate',
        'Operator-assisted sorting run core staff support',
        'Technician assisted imaging service charge',
        'Core specialist assisted session hourly tariff',
        'Assisted equipment access with staff operator'
      ]
    },
    mode_training: {
      train: [
        'Training orientation tutorial onboarding new user session',
        'Hands-on instrument training hourly fee',
        'New researcher orientation and certification session',
        'Mandatory safety and equipment training mode',
        'One-on-one microscope training instruction rate',
        'User onboarding tutorial core staff training',
        'Initial certification training booking mode',
        'Equipment training session billed at training rate',
        'Instructional onboarding flow cytometer training',
        'Novice user training and checkout session',
        'Core training course hands-on instrument fee',
        'Supervised training mode before self-service access',
        'New operator instruction and orientation session',
        'Training workshop per hour user onboarding',
        'Hands-on training qualification booking type',
        'Operator training session service mode',
        'Equipment tutorial and checkout reservation',
        'Beginner training session core staff instruction',
        'Qualification training mode rate entry',
        'Instrument orientation training hourly charge'
      ],
      heldout: [
        'New researcher certification orientation and training session',
        'Hands-on microscope instruction onboarding fee',
        'Mandatory equipment tutorial and qualification mode',
        'Supervised training course hourly booking rate',
        'Initial operator orientation training tariff'
      ]
    },
    tier_internal: {
      train: [
        'Internal campus university member intramural rate',
        'Home institution faculty lab internal rate',
        'On-campus academic member internal pricing tier',
        'University investigator grant internal rate',
        'Intramural core facility member rate',
        'In-house department user internal tier',
        'Affiliated campus lab internal hourly rate',
        'Internal university PTA grant rate',
        'Campus member internal fee tier',
        'Home university investigator internal price',
        'Internal academic department user rate',
        'On-campus university member rate',
        'Intramural research group internal tier',
        'Internal institutional rate card column',
        'Campus affiliated user internal price',
        'University core member internal tariff',
        'In-house campus lab internal rate',
        'Internal faculty research rate',
        'Academic home-campus internal tier',
        'Internal campus grant billing tier'
      ],
      heldout: [
        'On-campus intramural university member rate tier',
        'Home institution in-house faculty billing rate',
        'Campus affiliated lab internal pricing column',
        'University member internal academic tariff',
        'Intramural investigator internal fee tier'
      ]
    },
    tier_external: {
      train: [
        'External outside academic non-profit visitor rate',
        'Non-university external academic collaborator rate',
        'Visiting researcher outside institution external tier',
        'External academic nonprofit organization fee',
        'Other university external academic rate column',
        'Outside non-profit partner external tariff',
        'External academic user rate card price',
        'Non-campus academic visitor external tier',
        'Outside academic institution external rate',
        'External non-commercial research institute fee',
        'Visiting university lab external rate',
        'External non-profit affiliate pricing tier',
        'Outside university external academic hourly rate',
        'External collaborator nonprofit institution tier',
        'Non-member academic external billing tier',
        'External university research group rate',
        'Outside academic partner external tariff',
        'Visiting scientist external non-profit fee',
        'External public research center rate',
        'External academic user type pricing'
      ],
      heldout: [
        'Visiting outside academic non-profit institution rate tier',
        'Non-university external collaborator hourly fee',
        'External non-commercial research partner tariff',
        'Other university academic visitor rate column',
        'Outside non-profit institution external billing rate'
      ]
    },
    tier_commercial: {
      train: [
        'Commercial industry corporate for-profit private rate',
        'Biotech startup commercial industrial rate tier',
        'For-profit company corporate core fee',
        'Industrial client commercial hourly tariff',
        'Private sector corporate commercial rate',
        'Commercial pharma industry user tier',
        'For-profit enterprise commercial billing rate',
        'Corporate biotech commercial price column',
        'Industry sponsor commercial rate card entry',
        'Private startup commercial equipment fee',
        'Commercial corporate rate non-academic tier',
        'For-profit industrial partner rate',
        'Biotech corporate commercial hourly price',
        'Commercial business client fee tier',
        'Industry commercial user affiliation rate',
        'Private company for-profit tariff',
        'Corporate client commercial service tier',
        'Commercial biotechnology rate tier',
        'Industrial for-profit billing rate',
        'Corporate external commercial charge'
      ],
      heldout: [
        'For-profit corporate biotech industry billing rate',
        'Private sector commercial startup hourly tariff',
        'Industrial enterprise client commercial rate tier',
        'Corporate pharmaceutical commercial pricing column',
        'For-profit company commercial equipment fee'
      ]
    },
    basis_union: {
      train: [
        'Bill the larger of booked time plus used overrun union',
        'Booked plus used time billed whichever is longer',
        'Charge reserved hours plus any overrun past end',
        'Union of scheduled booking and actual instrument use',
        'Booked time that is not used is still charged plus overruns',
        'Charge greater of reservation window or actual runtime',
        'Booked plus overrun usage union billing policy',
        'Both booked window and overrun minutes billed',
        'Reserved hours billed even if unused plus overrun time',
        'Union billing rule booked and actual combined',
        'Charge full booking plus extended actual run',
        'Never bill less than booked; include overruns',
        'Booked time plus unbooked overrun union rule',
        'Whichever is larger booked or used union billing',
        'Unused booked slots billed plus overrun usage',
        'Combined union of reservation and plug runtime',
        'Booked window plus late overrun minutes',
        'Charge reserved duration and any post-slot overrun',
        'Full reservation plus actual extension union',
        'Booked and used union billing policy'
      ],
      heldout: [
        'Charge whichever is larger of booked slot and actual overrun union',
        'Reserved hours stay billable plus any overrun extension past booking',
        'Combined union of scheduled booking and measured runtime',
        'Unused reserved minutes still charged along with overruns',
        'Billing policy booked plus used union rule'
      ]
    },
    basis_actual: {
      train: [
        'Used only actual instrument runtime acquisition time',
        'Charge strictly for actual measured use only',
        'Bill only actual laser or acquisition minutes used',
        'Actual run time only ignore unused reservation',
        'Acquisition time metered power or sensor runtime only',
        'Used-only billing actual run duration only',
        'Charge exclusively for observed active instrument use',
        'Bill real elapsed usage time not scheduled hours',
        'Metered actual usage time only no booking fee',
        'Acquisition time from active sensor state only',
        'Pay only for minutes the instrument actually ran',
        'Actual logged use only billing policy',
        'Charge actual acquisition duration only',
        'Used time only rule ignoring booked slot',
        'Strict actual usage billing from instrument log',
        'Active acquisition minutes only billed',
        'Bill observed actual runtime exclusively',
        'Used-only actual hours billing rule',
        'Measured actual utilization time only',
        'Actual run hours billed regardless of booking'
      ],
      heldout: [
        'Charge strictly for observed actual runtime used only',
        'Metered acquisition time only ignoring scheduled booking',
        'Pay exclusively for actual active laser minutes',
        'Billing based solely on measured actual usage time',
        'Used-only actual instrument duration rule'
      ]
    },
    basis_booked: {
      train: [
        'Booked only scheduled reservation time only',
        'Charge strictly based on reserved calendar hours',
        'Bill booked duration regardless of actual logon',
        'Booked-only rule ignore overrun and early finish',
        'Scheduled slot hours only flat reservation billing',
        'Charge exact calendar booking window only',
        'Booked time only policy from scheduler export',
        'Reservation duration only no sensor adjustment',
        'Bill reserved calendar hours exclusively',
        'Booked only billing rule fixed slot charge',
        'Charge booked start to booked end only',
        'Flat scheduled booking hours billed only',
        'Booked-time-only billing policy',
        'Calendar reservation hours billed without logs',
        'Scheduled reservation duration only charged',
        'Bill booked slots only ignore login logs',
        'Reserved calendar time only rule',
        'Charge fixed booked duration only',
        'Booked hours only scheduler billing',
        'Calendar booked time exclusively charged'
      ],
      heldout: [
        'Charge strictly for calendar booked reservation hours only',
        'Flat scheduled booking duration billed without usage adjustment',
        'Booked-only billing from reserved slot start to end',
        'Bill reserved schedule hours exclusively',
        'Booked time only policy from booking calendar'
      ]
    }
  };

  const train = [], heldout = [];
  for (const [label, split] of Object.entries(groups)) {
    for (const text of split.train) train.push({ text, label });
    for (const text of split.heldout) heldout.push({ text, label });
  }
  return { train, heldout };
}

// ------------------------------------------------------------------
// 6. Session Discrepancy & Anomaly Auditor (Captain Nitpick)
// ------------------------------------------------------------------
const AUDITOR_FEATURES = [
  'booked_min',
  'used_min',
  'plug_active_min',
  'overrun_min',
  'underrun_ratio',
  'has_booking',
  'has_usage',
  'idle_tail_min',
  'robust_zscore'
];

function buildAuditorDataset() {
  const rTrain = mulberry32(4242);
  const rTest = mulberry32(7719);
  const between = (rnd, lo, hi) => lo + rnd() * (hi - lo);

  function sample(rnd, label) {
    if (label === 'clean_match') {
      const booked = between(rnd, 60, 180);
      const delta = between(rnd, -8, 10);
      const plug = Math.max(15, booked + delta);
      const idle = between(rnd, 0, 8);
      return {
        label,
        features: [
          booked,
          plug + idle,
          plug,
          Math.max(0, delta),
          plug / booked,
          1,
          1,
          idle,
          between(rnd, -0.5, 1.8)
        ]
      };
    }
    if (label === 'overrun') {
      const booked = between(rnd, 60, 180);
      const over = between(rnd, 22, 115);
      const plug = booked + over;
      const idle = between(rnd, 0, 10);
      return {
        label,
        features: [
          booked,
          plug + idle,
          plug,
          over,
          plug / booked,
          1,
          1,
          idle,
          between(rnd, 0.8, 2.7)
        ]
      };
    }
    if (label === 'idle_login_mismatch') {
      // PC login stays open far past smart plug active run (e.g. John copying files 09:00-13:00 while run stopped at 12:30 or 11:00)
      const booked = between(rnd, 90, 180);
      const plug = booked + between(rnd, -5, 45);
      const idle = between(rnd, 25, 95);
      const used = plug + idle;
      return {
        label,
        features: [
          booked,
          used,
          plug,
          Math.max(0, used - booked),
          plug / booked,
          1,
          1,
          idle,
          between(rnd, 0.5, 2.6)
        ]
      };
    }
    if (label === 'walk_up_unbooked') {
      const plug = between(rnd, 20, 160);
      const idle = between(rnd, 0, 10);
      return {
        label,
        features: [
          0,
          plug + idle,
          plug,
          plug + idle,
          0,
          0,
          1,
          idle,
          between(rnd, 0.0, 2.0)
        ]
      };
    }
    if (label === 'no_show') {
      const booked = between(rnd, 60, 240);
      return {
        label,
        features: [
          booked,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          between(rnd, -1.0, 0.5)
        ]
      };
    }
    if (label === 'short_underrun') {
      // e.g. Billy books 180 min and runs 20 min
      const booked = between(rnd, 120, 240);
      const ratio = between(rnd, 0.08, 0.36);
      const plug = booked * ratio;
      const idle = between(rnd, 0, 6);
      return {
        label,
        features: [
          booked,
          plug + idle,
          plug,
          0,
          ratio,
          1,
          1,
          idle,
          between(rnd, -1.8, -0.3)
        ]
      };
    }
    // duration_outlier
    const booked = between(rnd, 180, 360);
    const over = between(rnd, 60, 180);
    const plug = booked + over;
    const idle = between(rnd, 0, 15);
    return {
      label: 'duration_outlier',
      features: [
        booked,
        plug + idle,
        plug,
        over,
        plug / booked,
        1,
        1,
        idle,
        between(rnd, 3.6, 8.5)
      ]
    };
  }

  const labels = [
    'clean_match',
    'overrun',
    'walk_up_unbooked',
    'no_show',
    'short_underrun',
    'idle_login_mismatch',
    'duration_outlier'
  ];
  const train = [], heldout = [];
  for (const label of labels) {
    for (let i = 0; i < 40; i++) train.push(sample(rTrain, label));
    for (let i = 0; i < 10; i++) heldout.push(sample(rTest, label));
  }
  return { train, heldout };
}

// ------------------------------------------------------------------
// 7. Command Intent Router (Parity Commander)
// ------------------------------------------------------------------
function buildIntentDataset() {
  const groups = {
    full_close_pitch: {
      train: [
        'Run the full month-end close for October',
        'Run all 6 agents on the pitch scenario',
        'Close October billing with the full Parity crew',
        'Run the entire crew on FBS pitch demo for 2026-10',
        'Reconcile the whole month from bookings to final stage',
        'Execute full end to end core facility billing close',
        'Run full crew demo with John Adam and Billy',
        'Launch complete 6-agent reconciliation on iLab pitch',
        'Run everything for October 2026 close',
        'Start full facility close pipeline on FBS',
        'Do the whole month close with all specialists',
        'Run full crew reconciliation for November',
        'Kick off the full pitch workflow across all agents',
        'Complete monthly instrument billing close end to end',
        'Run all agents and stage the full October close',
        'Full crew run on FBS October pitch scenario',
        'Perform complete monthly reconciliation and staging',
        'Run the 6-agent pitch story on iLab for 2026-10',
        'Execute full monthly close across the whole crew',
        'Turn on all six agents and close out the month'
      ],
      heldout: [
        'Run the complete 6-agent month close on FBS pitch',
        'Close out October facility billing using the full crew',
        'Execute end to end reconciliation for John Adam and Billy',
        'Launch all six specialists for the October pitch run',
        'Do a full monthly close across all Parity agents'
      ]
    },
    pull_schedule: {
      train: [
        'Pull October reservations from FBS',
        'Fetch iLab bookings for 2026-10',
        'Have Sir Slots-a-Lot pull the iLab schedule',
        'Download reservation calendar from FBS with retry',
        'Pull schedule only for November on iLab',
        'Paginate FBS bookings and handle 429 rate limits',
        'Fetch October calendar bookings from iLab',
        'Run schedule puller on FBS retry scenario',
        'Get the October reservation export from FBS',
        'Pull bookings and reject invalid dates on FBS',
        'Have Slots grab the September iLab reservation list',
        'Fetch facility booking schedule for 2026-11',
        'Pull FBS reservation pages and deduplicate repeats',
        'Collect the monthly schedule from iLab calendar',
        'Run Sir Slots-a-Lot to map booking columns from FBS',
        'Grab October reservations from iLab without pricing',
        'Import schedule bookings from FBS retry test',
        'Pull instrument reservations for August from iLab',
        'Fetch calendar slots from FBS and check invalid rows',
        'Download the October booking table from iLab'
      ],
      heldout: [
        'Fetch October reservations from iLab with rate limit retry',
        'Have Sir Slots-a-Lot grab the FBS booking calendar',
        'Pull the 2026-11 instrument schedule from FBS',
        'Download and deduplicate October bookings from iLab',
        'Get reservation calendar slots from FBS only'
      ]
    },
    inspect_power: {
      train: [
        'Have Count Wattula inspect smart-plug watts',
        'Inspect smart plug telemetry and PC logon logs',
        'Check power draw and separate active laser runs from idle',
        'Match bookings with smart-plug power and workstation logins',
        'Run sensors and match for October on FBS',
        'Inspect outlet wattage streams for standby file copies',
        'Have Dr. Venn pair reservations with PC usage logs',
        'Analyze smart-plug watts and workstation sessions',
        'Check which sessions had active laser power vs standby',
        'Run Count Wattula and Dr. Venn on October iLab',
        'Measure active acquisition minutes from plug telemetry',
        'Pair calendar bookings against instrument PC logons',
        'Detect sensor dropouts and idle PC copy tails',
        'Inspect power meter intervals for confocal and cytometer',
        'Match usage logs to reservations without guessing logoffs',
        'Check smart-plug watt draw and logon logoff intervals',
        'Run telemetry collector and session matcher for 2026-10',
        'Separate real instrument runs from idle workstation logins',
        'Verify power consumption and match sessions on FBS',
        'Have Wattula check outlet watts and Venn match usage'
      ],
      heldout: [
        'Inspect smart-plug power draw and workstation login tails',
        'Have Count Wattula analyze plug wattage intervals for October',
        'Pair October reservations with active power and PC sessions',
        'Check standby idle vs active laser watts with Dr. Venn',
        'Run telemetry and session matching on iLab bookings'
      ]
    },
    price_month: {
      train: [
        'Price October sessions using the rate card',
        'Have Baron Von Markup calculate draft billing totals',
        'Apply internal external and commercial rate tiers',
        'Calculate hourly charges and after-hours splits for 2026-10',
        'Run booked-time billing and compute draft totals',
        'Price the October instrument usage with 30-minute rounding',
        'Compute draft invoice totals from the fee schedule',
        'Apply core facility tariffs and weekend rate rules',
        'Have Markup price self-service and assisted sessions',
        'Calculate October billing amounts by user tier',
        'Classify billing policy clauses and compute session charges',
        'Run Baron Von Markup on November iLab rates',
        'Price all matched sessions under commercial and academic tiers',
        'Estimate monthly revenue and draft charges for October',
        'Apply rounding increments and after-hours confocal rates',
        'Compute total billable hours and dollar charges',
        'Price October bookings using booked-only tariff rules',
        'Run rate and rule pricer for 2026-10 FBS',
        'Calculate line-item prices from the published rate sheet',
        'Price facility runs with internal and industry rates'
      ],
      heldout: [
        'Calculate draft billing totals using October rate cards',
        'Have Baron Von Markup apply internal and commercial tariffs',
        'Compute hourly charges with rounding and after-hours rules',
        'Price October sessions and output total billable dollars',
        'Run the rate pricer for booked-time billing on FBS'
      ]
    },
    audit_flags: {
      train: [
        'Audit October sessions for discrepancies and flags',
        'Have Captain Nitpick flag overruns and no-shows',
        'Find unbooked walk-ups and short underruns in October',
        'Review discrepancy flags and anomaly scores for 2026-10',
        'Audit billing results and stage rows for manager approval',
        'Check who overran their slot or skipped their booking',
        'Run Captain Nitpick to catch idle login mismatches',
        'Show flagged discrepancies and duration outliers in results',
        'Audit John overrun Adam walk-up and Billy underrun',
        'Inspect all anomaly flags before approving charges',
        'Flag suspicious sessions and hold rows for sign-off',
        'Run discrepancy auditor on October iLab results',
        'Check results for no-shows walk-ups and billing anomalies',
        'Have Nitpick review session discrepancies for 2026-10',
        'Identify anomalous runs and stage review flags',
        'Audit matched sessions and explain every discrepancy',
        'Find unbooked usage and short sprints to flag',
        'Review flagged billing lines and discrepancy confidence',
        'Catch billing errors and outliers before export',
        'Run anomaly audit on October results on FBS'
      ],
      heldout: [
        'Have Captain Nitpick audit October results for discrepancy flags',
        'Flag overruns no-shows and walk-ups for manager review',
        'Check October billing results for anomalies and outliers',
        'Audit reconciled sessions and stage discrepancies before approval',
        'Find idle login mismatches and unbooked runs to flag'
      ]
    },
    check_workspace: {
      train: [
        'Check my loaded workspace spreadsheets for October',
        'Run the crew on my local CSV and Excel files',
        'Reconcile the spreadsheets in my workspace folder',
        'Process uploaded CSV reservations and usage logs',
        'Audit my workspace files for 2026-10',
        'Analyze local spreadsheet exports loaded in Parity',
        'Run full reconciliation on my workspace CSVs',
        'Check the Excel price sheet and CSV logs in my workspace',
        'Import and reconcile files from my local folder',
        'Run Parity crew against workspace spreadsheets',
        'Inspect my uploaded booking CSV and smart-plug file',
        'Close October using my local workspace files',
        'Validate and price spreadsheets in the current workspace',
        'Check local files loaded from my computer',
        'Run discrepancy review on workspace CSV exports',
        'Process my folder of reservation and logon spreadsheets',
        'Reconcile my Excel workbook and CSV telemetry',
        'Run crew on workspace data instead of simulator',
        'Check uploaded lab spreadsheets for anomalies',
        'Analyze the CSV and XLSX tables in my workspace'
      ],
      heldout: [
        'Reconcile my loaded workspace CSV and Excel spreadsheets',
        'Run the crew against files in my local workspace folder',
        'Check uploaded reservation and power CSVs in workspace',
        'Process my local spreadsheet files for October billing',
        'Audit the spreadsheets currently loaded in my workspace'
      ]
    },
    scout_sources: {
      train: [
        'Have Sherlock Ohms scout available booking sources',
        'Discover scheduler capabilities and instrument catalog',
        'Classify source files and stamp SHA-256 provenance',
        'Run Sherlock Ohms to inspect data sources',
        'Probe FBS and iLab endpoints before pulling',
        'Identify what kind of spreadsheets these source files are',
        'Scout source schemas and hash provenance digests',
        'Have Ohms discover equipment catalogs on FBS',
        'Run source scout solo to inspect file types',
        'Classify uploaded tables as reservations usage or price sheets',
        'Probe scheduling capabilities on iLab',
        'Check source provenance and classify incoming files',
        'Have Sherlock check whether files are logs or rate cards',
        'Inspect available facility sources and instrument list',
        'Discover endpoints and verify source payload hashes',
        'Run source classifier on incoming facility exports',
        'Scout FBS capabilities and list available instruments',
        'Have Sherlock Ohms fingerprint source tables',
        'Detect unknown file schemas and stamp SHA-256',
        'Probe source catalog without pulling full schedules'
      ],
      heldout: [
        'Have Sherlock Ohms discover capabilities and classify sources',
        'Probe iLab endpoints and list the instrument catalog',
        'Identify source table types and stamp SHA-256 digests',
        'Run source scout to inspect incoming file schemas',
        'Classify files into reservations logs or price sheets'
      ]
    },
    train_models: {
      train: [
        'Train all local ML models now',
        'Retrain the crew classifiers and show accuracy',
        'Run local model training and held-out evaluation',
        'Fine-tune the Parity specialist models',
        'Rebuild model weights and check macro F1 scores',
        'Train the seven local ML classifiers',
        'Refresh trained models from synthetic benchmarks',
        'Run agent training script and report accuracy',
        'Retrain column mapper and anomaly auditor models',
        'Update local machine learning models now',
        'Execute local model training pipeline',
        'Train classifiers and evaluate held-out split',
        'Rebuild trained-models.json and print metrics',
        'Fine-tune intent router and specialist classifiers',
        'Re-run ML training to update model weights',
        'Benchmark and retrain all local crew models',
        'Start model training inside Parity',
        'Train text and tabular classifiers from scratch',
        'Evaluate held-out accuracy by retraining models',
        'Run training on the Parity ML lab models'
      ],
      heldout: [
        'Retrain all local Parity ML models and print evaluation',
        'Run model training and check held-out accuracy and F1',
        'Fine-tune the specialist machine learning classifiers',
        'Rebuild local classifier weights from training splits',
        'Train the crew models and report benchmark scores'
      ]
    }
  };

  const train = [];
  const heldout = [];
  for (const [label, split] of Object.entries(groups)) {
    for (const text of split.train) train.push({ text, label });
    for (const text of split.heldout) heldout.push({ text, label });
  }
  return { train, heldout };
}

function sanitizeCustomSamples(customSamples = {}) {
  const out = {};
  if (!customSamples || typeof customSamples !== 'object') return out;
  const textAllowed = {
    source_classifier: new Set(['reservations', 'usage_log', 'power_telemetry', 'price_sheet', 'unrelated_notes']),
    column_mapper: new Set(['id', 'resource', 'user', 'start', 'end', 'status', 'lab', 'account', 'service', 'tier']),
    policy_pricer: new Set([
      'mode_self', 'mode_assisted', 'mode_training',
      'tier_internal', 'tier_external', 'tier_commercial',
      'basis_union', 'basis_actual', 'basis_booked'
    ]),
    intent_router: new Set([
      'full_close_pitch', 'pull_schedule', 'inspect_power', 'price_month',
      'audit_flags', 'check_workspace', 'scout_sources', 'train_models'
    ])
  };
  for (const [k, allowed] of Object.entries(textAllowed)) {
    if (Array.isArray(customSamples[k])) {
      out[k] = customSamples[k]
        .filter(s => s && typeof s.text === 'string' && s.text.trim() && s.text.length <= 400 && allowed.has(s.label))
        .slice(0, 120)
        .map(s => ({ text: s.text.trim(), label: s.label }));
    }
  }
  const tabAllowed = {
    power_state: {
      labels: new Set(['off', 'standby_idle', 'active_acquisition', 'sensor_dropout']),
      len: POWER_FEATURES.length
    },
    session_matcher: {
      labels: new Set(['matched', 'ambiguous_review', 'unmatched']),
      len: MATCHER_FEATURES.length
    },
    anomaly_auditor: {
      labels: new Set(['clean_match', 'overrun', 'walk_up_unbooked', 'no_show', 'short_underrun', 'idle_login_mismatch', 'duration_outlier']),
      len: AUDITOR_FEATURES.length
    }
  };
  for (const [k, spec] of Object.entries(tabAllowed)) {
    if (Array.isArray(customSamples[k])) {
      out[k] = customSamples[k]
        .filter(s => s && spec.labels.has(s.label) && (Array.isArray(s.features) || (s.features && typeof s.features === 'object')))
        .slice(0, 120)
        .map(s => ({ features: s.features, label: s.label }));
    }
  }
  return out;
}

function trainAllModels({ customSamples = {}, outDir = null } = {}) {
  const started = Date.now();
  const extra = sanitizeCustomSamples(customSamples);

  const srcData = buildSourceDataset();
  const colData = buildColumnDataset();
  const pwrData = buildPowerDataset();
  const matData = buildMatcherDataset();
  const polData = buildPolicyDataset();
  const audData = buildAuditorDataset();
  const intData = buildIntentDataset();

  const datasets = {
    source_classifier: { kind: 'text', agent: 'Sherlock Ohms', train: [...srcData.train, ...(extra.source_classifier || [])], heldout: srcData.heldout },
    column_mapper: { kind: 'text', agent: 'Sir Slots-a-Lot', train: [...colData.train, ...(extra.column_mapper || [])], heldout: colData.heldout },
    power_state: { kind: 'tabular', agent: 'Count Wattula', features: POWER_FEATURES, train: [...pwrData.train, ...(extra.power_state || [])], heldout: pwrData.heldout },
    session_matcher: { kind: 'tabular', agent: 'Dr. Venn', features: MATCHER_FEATURES, train: [...matData.train, ...(extra.session_matcher || [])], heldout: matData.heldout },
    policy_pricer: { kind: 'text', agent: 'Baron Von Markup', train: [...polData.train, ...(extra.policy_pricer || [])], heldout: polData.heldout },
    anomaly_auditor: { kind: 'tabular', agent: 'Captain Nitpick', features: AUDITOR_FEATURES, train: [...audData.train, ...(extra.anomaly_auditor || [])], heldout: audData.heldout },
    intent_router: { kind: 'text', agent: 'Parity Commander', train: [...intData.train, ...(extra.intent_router || [])], heldout: intData.heldout }
  };

  const models = {};
  const perModel = {};
  let totalTrain = 0, totalHeldout = 0, accSum = 0, f1Sum = 0;

  for (const [name, ds] of Object.entries(datasets)) {
    const model = ds.kind === 'text'
      ? trainTextClassifier(ds.train)
      : trainTabularClassifier(ds.train, ds.features);
    const evalRes = evaluateClassifier(
      item => ds.kind === 'text' ? predictText(model, item.text) : predictTabular(model, item.features),
      ds.heldout
    );
    models[name] = model;
    perModel[name] = {
      name,
      agent: ds.agent,
      kind: ds.kind,
      type: model.type,
      classes: model.labels.length,
      trainingSamples: ds.train.length,
      heldoutSamples: ds.heldout.length,
      customAdded: (extra[name] || []).length,
      correct: evalRes.correct,
      accuracy: evalRes.accuracy,
      macroF1: evalRes.macroF1,
      perClass: evalRes.perClass,
      confusionMatrix: evalRes.confusionMatrix,
      failures: evalRes.failures
    };
    totalTrain += ds.train.length;
    totalHeldout += ds.heldout.length;
    accSum += evalRes.accuracy;
    f1Sum += evalRes.macroF1;
  }

  const modelCount = Object.keys(datasets).length;
  const colEval = perModel.column_mapper;
  const trainedAt = new Date().toISOString();
  const durationMs = Math.max(1, Date.now() - started);

  const evaluation = {
    scope: 'Synthetic multi-agent training & non-overlapping held-out benchmarks; no vendor credentials or customer PII.',
    trainedAt,
    durationMs,
    // Backward-compatible column_mapper fields expected by existing runtime.info().model
    trainingSamples: colEval.trainingSamples,
    heldoutSamples: colEval.heldoutSamples,
    correct: colEval.correct,
    accuracy: colEval.accuracy,
    split: 'Non-overlapping synthetic held-out splits per specialist agent',
    failures: colEval.failures,
    // Multi-agent summary
    totalTrainingSamples: totalTrain,
    totalHeldoutSamples: totalHeldout,
    averageAccuracy: Math.round((accSum / modelCount) * 10000) / 10000,
    averageMacroF1: Math.round((f1Sum / modelCount) * 10000) / 10000,
    models: perModel
  };

  const bundle = {
    version: 2,
    trainedAt,
    models,
    evaluation
  };

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
    const target = path.join(outDir, 'trained-models.json');
    fs.writeFileSync(target + '.tmp', JSON.stringify(bundle), { mode: 0o600 });
    fs.renameSync(target + '.tmp', target);
  }

  return bundle;
}

if (require.main === module) {
  const bundle = trainAllModels();
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  fs.writeFileSync(path.join(MODEL_DIR, 'columns.json'), JSON.stringify(bundle.models.column_mapper, null, 2) + '\n');
  fs.writeFileSync(path.join(MODEL_DIR, 'models.json'), JSON.stringify(bundle.models) + '\n');
  fs.writeFileSync(path.join(MODEL_DIR, 'evaluation.json'), JSON.stringify(bundle.evaluation, null, 2) + '\n');
  console.log(JSON.stringify({
    trainedAt: bundle.trainedAt,
    durationMs: bundle.evaluation.durationMs,
    totalTrainingSamples: bundle.evaluation.totalTrainingSamples,
    totalHeldoutSamples: bundle.evaluation.totalHeldoutSamples,
    averageAccuracy: bundle.evaluation.averageAccuracy,
    averageMacroF1: bundle.evaluation.averageMacroF1,
    models: Object.fromEntries(
      Object.entries(bundle.evaluation.models).map(([k, v]) => [k, {
        agent: v.agent,
        trainingSamples: v.trainingSamples,
        heldoutSamples: v.heldoutSamples,
        accuracy: v.accuracy,
        macroF1: v.macroF1
      }])
    )
  }, null, 2));
}

module.exports = {
  trainAllModels,
  POWER_FEATURES,
  MATCHER_FEATURES,
  AUDITOR_FEATURES
};
