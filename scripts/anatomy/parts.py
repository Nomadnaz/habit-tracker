# Which Z-Anatomy objects make up each muscle id on the BODY tab.
# Paired ids get '.l' / '.r' appended (Z-Anatomy's own side suffixes; +x is
# the figure's left in both). Names without a side are taken from both sides
# for an unsided id ('neck', 'head', 'abs.*').
# Muscles hidden under others (rhomboids, supraspinatus, vastus intermedius,
# gluteus minimus...) are left out: they can't be seen or tapped.
# 'head', 'hand', 'foot' and the joints are skin regions from Z-Anatomy's
# "Regions of human body" — there's no muscle to show there.

PAIRED = {
    'delt.front': ['Clavicular part of deltoid muscle'],
    'delt.side': ['Acromial part of deltoid muscle'],
    'delt.rear': ['Scapular spinal part of deltoid muscle'],
    'pec.upper': ['Clavicular head of pectoralis major muscle'],
    'pec.lower': ['Sternocostal head of pectoralis major muscle', '(Abdominal part of pectoralis major muscle)'],
    'traps.upper': ['Descending part of trapezius muscle'],
    'traps.mid': ['Transverse part of trapezius muscle'],
    'traps.lower': ['Ascending part of trapezius muscle'],
    'cuff': ['Infraspinatus muscle', 'Teres minor muscle'],
    'teres': ['Teres major muscle'],
    'lat': ['Latissimus dorsi muscle'],
    'erector': ['Iliocostalis lumborum muscle', 'Iliocostalis thoracis muscle', 'Longissimus thoracis muscle', 'Spinalis thoracis muscle'],
    'biceps': ['Long head of biceps brachii', 'Short head of biceps brachii'],
    'brachialis': ['Brachialis muscle', 'Coracobrachialis muscle'],
    'triceps.lat': ['Lateral head of triceps brachii'],
    'triceps.long': ['Long head of triceps brachii', 'Medial head of triceps brachii'],
    'elbow': ['Posterior region of elbow'],
    'brachiorad': ['Brachioradialis muscle'],
    'forearm.flex': ['Flexor carpi radialis', 'Palmaris longus muscle', 'Humeral head of flexor carpi ulnaris',
                     'Ulnar head of flexor carpi ulnaris', 'Humero-ulnar head of flexor digitorum superficialis',
                     'Radial head of flexor digitorum superficialis', 'Superficial head of pronator teres'],
    'forearm.ext': ['Extensor carpi radialis longus', 'Extensor carpi radialis brevis', 'Extensor digitorum',
                    'Extensor digiti minimi', 'Humeral head of extensor carpi ulnaris', 'Ulnar head of extensor carpi ulnaris',
                    'Abductor pollicis longus', 'Extensor pollicis brevis', 'Anconeus muscle'],
    'wrist': ['Anterior region of wrist', 'Posterior region of wrist'],
    'hand': ['Dorsum of hand', 'Palm', 'Dorsal surfaces of digits of hand', 'Palmar surfaces of digits of hand'],
    'oblique': ['External abdominal oblique muscle'],
    'serratus': ['Serratus anterior muscle'],
    'hipflex': ['Iliacus muscle', 'Psoas major'],
    'tfl': ['Tensor fasciae latae', 'Iliotibial tract'],
    'glute.max': ['Gluteus maximus muscle'],
    'glute.med': ['Gluteus medius muscle'],
    'quad.rf': ['Rectus femoris muscle'],
    'quad.vl': ['Vastus lateralis muscle'],
    'quad.vm': ['Vastus medialis muscle'],
    'sartorius': ['Sartorius muscle'],
    'adductor': ['Adductor longus', 'Adductor magnus', 'Gracilis muscle', 'Pectineus muscle'],
    'ham.bf': ['Long head of biceps femoris', 'Short head of biceps femoris'],
    'ham.st': ['Semitendinosus muscle', 'Semimembranosus muscle'],
    'knee': ['Anterior region of knee'],
    'tib': ['Tibialis anterior muscle'],
    'shin': ['Extensor digitorum longus', 'Extensor hallucis longus'],
    'peroneal': ['Fibularis longus muscle', 'Fibularis brevis muscle'],
    'gastro.lat': ['Lateral head of gastrocnemius'],
    'gastro.med': ['Medial head of gastrocnemius'],
    'soleus': ['Soleus muscle'],
    'ankle': ['Calcaneal tendon', 'Anterior region of ankle', 'Lateral malleolus', 'Medial malleolus'],
    'foot': ['Dorsum of foot', 'Sole', 'Dorsal surfaces of digits of foot', 'Plantar surfaces of digits of foot', 'Heel region'],
}

SINGLE = {
    'head': ['Frontal region', 'Parietal region', 'Occipital region', 'Temporal region', 'Orbital region',
             'Infra-orbital region', 'Zygomatic region', 'Buccal region', 'Parotideomasseteric region', 'Oral region',
             'Mental region', 'Nasal region', 'Mastoid region', 'Auricular region', 'Helix', 'Lobule of auricle',
             'Eyelids', 'External nose', 'Upper lip', 'Chin'],
    'neck': ['Sternocleidomastoid muscle', 'Splenius capitis muscle', 'Levator scapulae', 'Scalenus anterior muscle',
             'Scalenus medius muscle', 'Omohyoid muscle', 'Sternohyoid muscle'],
    'abs': ['Rectus abdominis muscle', 'Pyramidalis muscle'],  # split into abs.upper / abs.lower at the navel
}

ABS_SPLIT_Z = 1.03  # m — navel height in Z-Anatomy; rectus above it → abs.upper

# Z-Anatomy's external oblique carries its aponeurosis across the front of
# the abdomen, and the lat its thoracolumbar aponeurosis across the lower
# back — both thin sheets that would hide the abs and the erectors. Faces
# whose centre falls in these boxes (Blender metres: x side, -y front,
# z up) are cut away.
TRIM = {
    'oblique': lambda x, y, z: abs(x) < 0.088 and y < -0.02 and 0.84 < z < 1.30,
    'lat': lambda x, y, z: abs(x) < 0.075 and y > 0.0 and z < 1.20,
}
