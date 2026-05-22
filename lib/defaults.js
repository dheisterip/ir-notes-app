export const DEFAULT_SHARED = {
  moderate_sedation: `Moderate sedation was administered under the direct supervision of the performing physician. The patient was continuously monitored with pulse oximetry, cardiac monitoring, capnography, and blood pressure checks every 5 minutes throughout the procedure. Monitoring was maintained until the patient met discharge criteria. Total moderate sedation time: {{moderate_sedation_time}} minutes. Medications and doses are documented in the nursing record.`,

  radiation_safety: `Radiation safety measures were observed in accordance with ALARA principles. Fluoroscopy time: {{fluoroscopy_time}} minutes. Total air kerma: {{radiation_mgy}} mGy. Dose area product (DAP): {{radiation_dap}} mGy·cm². Lead shielding was utilized for staff and patient where applicable.`,

  consent: `Informed consent was obtained from the patient/legal guardian prior to the procedure. The risks (including but not limited to bleeding, infection, vascular injury, contrast reaction, and procedural failure), benefits, and alternatives were discussed in detail. All questions were answered and the patient/guardian verbalized understanding.`,

  sterile_technique: `The procedure was performed under strict sterile technique utilizing full barrier precautions including sterile gown, gloves, drapes, and cap/mask.`,

  contrast_protocol: `Iodinated contrast was used in accordance with departmental protocol. Pre-procedure renal function was reviewed. Patient was queried for prior contrast reactions and metformin use.`,
}

export const DEFAULT_TEMPLATES = {
  cvc_placement: {
    name: 'Central Venous Catheter Placement',
    keywords: ['CVC', 'central line', 'central venous', 'IJ', 'internal jugular', 'subclavian', 'femoral line'],
    template: `PROCEDURE: CENTRAL VENOUS CATHETER PLACEMENT
DATE: {{date}}
PERFORMING PHYSICIAN: {{physician}}
PATIENT: {{patient_name}}   MRN: {{mrn}}
─────────────────────────────────────────
INDICATION: {{indication}}

PROCEDURE DETAILS:
Access site: {{side}} {{access_site}}
Catheter type: {{catheter_type}}
French size: {{catheter_french}} Fr
Length inserted: {{catheter_length}} cm
Number of lumens: {{catheter_lumens}}
Tip position: {{catheter_tip_position}}

{{shared:consent}}

{{shared:sterile_technique}}

TECHNIQUE:
The patient was positioned appropriately. The {{access_site}} region was prepped and draped in sterile fashion. Under real-time ultrasound guidance, the {{access_site}} vein was identified and accessed using a {{gauge}} gauge needle. Venous position was confirmed with aspiration of non-pulsatile dark blood. A guidewire was advanced without resistance under fluoroscopic guidance. The skin was nicked with a scalpel and the tract was serially dilated. A {{catheter_french}} Fr {{catheter_type}} catheter was advanced to a length of {{catheter_length}} cm and the tip was confirmed at the {{catheter_tip_position}}. The catheter was secured with suture and covered with a sterile occlusive dressing. All lumens were aspirated and flushed without difficulty.

{{shared:moderate_sedation}}

{{shared:radiation_safety}}

POST-PROCEDURE:
Chest radiograph confirmed catheter tip at {{catheter_tip_position}}. No pneumothorax identified. Catheter aspirates and flushes without difficulty.

COMPLICATIONS: {{complications}}

IMPRESSION: Successful placement of {{side}} {{catheter_type}} via {{access_site}} approach with tip at {{catheter_tip_position}}.`,
  },

  port_placement: {
    name: 'Implantable Port Placement',
    keywords: ['port', 'port-a-cath', 'mediport', 'implantable port', 'subcutaneous port'],
    template: `PROCEDURE: IMPLANTABLE VENOUS PORT PLACEMENT
DATE: {{date}}
PERFORMING PHYSICIAN: {{physician}}
PATIENT: {{patient_name}}   MRN: {{mrn}}
─────────────────────────────────────────
INDICATION: {{indication}}

PROCEDURE DETAILS:
Side: {{side}}
Access site: {{access_site}}
Port type: {{port_type}}
Catheter length: {{catheter_length}} cm
Tip position: {{catheter_tip_position}}

{{shared:consent}}

{{shared:sterile_technique}}

TECHNIQUE:
The patient was positioned supine with the head turned to the contralateral side. The {{side}} chest wall and neck were prepped and draped in sterile fashion. Under real-time ultrasound guidance, the {{access_site}} vein was accessed with a {{gauge}} gauge needle. A guidewire was advanced to the {{catheter_tip_position}} under fluoroscopic guidance. A subcutaneous pocket was created in the {{side}} anterior chest wall using blunt dissection. The port body was placed within the pocket. The catheter was tunneled, trimmed to appropriate length, and connected to the port reservoir. Port access was confirmed with aspiration and flush. The pocket was irrigated and closed in layers using {{suture_type}} suture. A sterile dressing was applied.

DEVICE DETAILS:
Port reservoir: {{port_type}}
Catheter length inserted: {{catheter_length}} cm
Tip position confirmed: {{catheter_tip_position}}

{{shared:moderate_sedation}}

{{shared:radiation_safety}}

POST-PROCEDURE:
Fluoroscopic images confirm catheter tip at {{catheter_tip_position}}. Port accessed and confirmed aspirating. Port flushed with heparinized saline per protocol. Site without evidence of hematoma or pneumothorax.

COMPLICATIONS: {{complications}}

IMPRESSION: Successful {{side}} implantable venous port placement with catheter tip at {{catheter_tip_position}}.`,
  },

  peripheral_angiogram: {
    name: 'Lower Extremity Revascularization',
    keywords: ['peripheral angiogram', 'lower extremity', 'leg revascularization', 'angioplasty', 'PTA', 'atherectomy', 'stent', 'claudication', 'limb ischemia', 'SFA', 'femoral artery', 'popliteal', 'tibial', 'iliac'],
    template: `PROCEDURE: LOWER EXTREMITY PERIPHERAL ANGIOGRAM AND INTERVENTION
DATE: {{date}}
PERFORMING PHYSICIAN: {{physician}}
PATIENT: {{patient_name}}   MRN: {{mrn}}
─────────────────────────────────────────
INDICATION: {{indication}}
PRE-PROCEDURE ABI/TBI: {{pre_abi}}

{{shared:consent}}

{{shared:sterile_technique}}

{{shared:contrast_protocol}}

ACCESS:
The {{access_site}} was prepped and draped in sterile fashion. Under ultrasound guidance, the {{access_vessel}} was accessed in {{access_approach}} fashion using a {{gauge}} gauge needle. A {{sheath_size}} Fr vascular sheath was placed without complication.

ANGIOGRAPHIC FINDINGS:
  Aortoiliac segment:       {{aortoiliac_findings}}
  Common femoral artery:    {{cfa_findings}}
  Superficial femoral art:  {{sfa_findings}}
  Popliteal artery:         {{popliteal_findings}}
  Tibial vessels:           {{tibial_findings}}
  Runoff:                   {{runoff_description}}

TARGET LESION(S): {{target_lesion}}
Estimated stenosis: {{stenosis_percent}}%   Length: {{lesion_length}} cm

INTERVENTION STEPS:
1. The target lesion was crossed using a {{wire_used}} wire and {{crossing_catheter}} catheter.
2. {{intervention_step_2}}
3. {{intervention_step_3}}
4. {{intervention_step_4}}

DEVICES USED:
  Wire(s):            {{wires_used}}
  Balloon(s):         {{balloons_used}}
  Stent(s):           {{stents_used}}
  Atherectomy device: {{atherectomy_device}}
  Contrast volume:    {{contrast_volume}} mL {{contrast_type}}

POST-INTERVENTION ANGIOGRAM:
{{post_intervention_findings}}
Residual stenosis: {{residual_stenosis}}%

CLOSURE:
Sheath removed. Hemostasis achieved via {{closure_method}}. Distal pulse confirmed post-closure.

{{shared:moderate_sedation}}

{{shared:radiation_safety}}

POST-PROCEDURE:
Distal pulses: {{post_pulses}}
ABI/TBI post-procedure: {{post_abi}}

COMPLICATIONS: {{complications}}

IMPRESSION: {{impression}}`,
  },

  pulmonary_thrombectomy: {
    name: 'Pulmonary Thrombectomy / EKOS / CDT',
    keywords: ['pulmonary embolism', 'PE', 'pulmonary thrombectomy', 'EKOS', 'EkoSonic', 'catheter directed thrombolysis', 'CDT', 'AngioVac', 'FlowTriever', 'Indigo', 'massive PE', 'submassive PE'],
    template: `PROCEDURE: PULMONARY THROMBECTOMY / CATHETER-DIRECTED THERAPY
DATE: {{date}}
PERFORMING PHYSICIAN: {{physician}}
PATIENT: {{patient_name}}   MRN: {{mrn}}
─────────────────────────────────────────
INDICATION: {{indication}}

RISK STRATIFICATION:
  PE Classification:  {{pe_classification}}
  RV/LV ratio:        {{rv_lv_ratio}}
  Troponin:           {{troponin}}
  BNP/NT-proBNP:      {{bnp}}
  Heart rate:         {{heart_rate}} bpm
  O2 saturation:      {{o2_sat}}%
  Shock index:        {{shock_index}}

{{shared:consent}}

{{shared:sterile_technique}}

ACCESS:
{{access_description}}
  Access site(s):   {{access_sites}}
  Sheath size(s):   {{sheath_sizes}}

RIGHT HEART PRESSURES (pre-intervention):
  RA pressure:      {{ra_pressure}} mmHg
  RV pressure:      {{rv_pressure}} mmHg
  PA pressure:      {{pa_pressure}} mmHg (mean: {{pa_mean}})
  PCWP:             {{wedge_pressure}} mmHg
  Cardiac output:   {{cardiac_output}} L/min

PULMONARY ANGIOGRAM:
  Right PA:           {{right_pa_findings}}
  Left PA:            {{left_pa_findings}}
  Thrombus burden:    {{thrombus_burden}}
  Clot location:      {{clot_location}}

INTERVENTION STEPS:
1. {{intervention_step_1}}
2. {{intervention_step_2}}
3. {{intervention_step_3}}
4. {{intervention_step_4}}
5. {{intervention_step_5}}

DEVICE DETAILS:
  Device used:            {{device_type}}
  Catheter placement:     {{catheter_placement}}
  Treatment duration:     {{treatment_duration}} hours
  tPA dose (if CDT):      {{tpa_dose}} mg/hr per catheter

POST-INTERVENTION:
  PA pressure post:       {{post_pa_pressure}} mmHg
  Post-angiogram result:  {{post_angiogram}}
  Estimated clot removed: {{thrombus_removed}}

CLOSURE: {{closure_description}}

{{shared:moderate_sedation}}

{{shared:radiation_safety}}

COMPLICATIONS: {{complications}}

IMPRESSION: {{impression}}`,
  },

  drainage_catheter: {
    name: 'Percutaneous Drainage Catheter',
    keywords: ['drainage', 'abscess drain', 'percutaneous drain', 'nephrostomy', 'biliary drain', 'pleural drain', 'empyema'],
    template: `PROCEDURE: PERCUTANEOUS DRAINAGE CATHETER PLACEMENT
DATE: {{date}}
PERFORMING PHYSICIAN: {{physician}}
PATIENT: {{patient_name}}   MRN: {{mrn}}
─────────────────────────────────────────
INDICATION: {{indication}}

PRE-PROCEDURE IMAGING:
  Collection location: {{collection_location}}
  Estimated size:      {{collection_size}} cm
  Character:           {{collection_character}}

{{shared:consent}}

{{shared:sterile_technique}}

TECHNIQUE:
The patient was positioned {{patient_position}}. The access site was prepped and draped in sterile fashion. Using {{guidance_modality}} guidance, the {{collection_location}} was identified. Under real-time guidance, a {{needle_gauge}} gauge needle was advanced into the collection with aspiration of {{fluid_character}} fluid confirming position. Aspirate was sent for {{aspirate_studies}}. Using Seldinger technique, the tract was serially dilated and a {{catheter_french}} Fr {{catheter_type}} drainage catheter was coiled within the collection. The catheter was secured to the skin using {{securement_method}} and connected to {{drainage_system}}.

CATHETER DETAILS:
  Type:             {{catheter_type}}
  French size:      {{catheter_french}} Fr
  Side/location:    {{side}}
  Initial output:   {{initial_output}} mL of {{fluid_character}}

{{shared:moderate_sedation}}

{{shared:radiation_safety}}

POST-PROCEDURE:
Catheter draining well. Catheter tip position confirmed by imaging.

COMPLICATIONS: {{complications}}

IMPRESSION: Successful {{catheter_french}} Fr {{catheter_type}} drainage catheter placement into {{collection_location}} with initial output of {{initial_output}} mL of {{fluid_character}} fluid.`,
  },
}
