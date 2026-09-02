export const MASK_PRESETS={
  base:{
    label:'Base',
    parts:[]
  },
  clown:{
    label:'Clown',
    parts:[
      {id:'clown-nose',label:'Nose',editor:{position:.25,scale:[.5,1.6]},anchor:{x:0,y:.085,z:'face'},shape:{type:'sphere',radius:.08768,embed:.70}},
      {id:'clown-left',label:'Left tuft',editor:{position:.25,scale:[.5,1.6]},anchor:{x:-.40,y:.245,z:-.035},shape:{type:'cloud'}},
      {id:'clown-right',label:'Right tuft',editor:{position:.25,scale:[.5,1.6]},anchor:{x:.40,y:.245,z:-.035},shape:{type:'cloud'}}
    ],
    cloudPuffs:[
      [0,0,.115,.120,.105],
      [-.035,.085,.090,.100,.090],
      [.035,.090,.100,.105,.095],
      [-.055,-.060,.095,.100,.090],
      [.055,-.050,.100,.105,.095],
      [0,.165,.085,.090,.082],
      [0,-.125,.082,.090,.080]
    ]
  },
  professor:{
    label:'Professor',
    parts:[
      {id:'prof-glasses',label:'Glasses',editor:{position:.25,scale:[.5,1.6]},anchor:{x:0,y:.152,z:'face'},shape:{type:'glasses'}},
      {id:'prof-hair',label:'Hair',editor:{position:.25,scale:[.5,1.6]},anchor:{x:0,y:.170,z:0},shape:{type:'hair'}}
    ],
    glasses:{
      frontInset:-.084,
      lensRadius:.09396,
      tubeRadius:.009048,
      eyeX:.13456,
      bridgeY:.02088,
      bridgeInnerX:.02552,
      templeMidX:.29580,
      templeEndX:.41180,
      templeMidY:.01160,
      templeEndY:.00464,
      templeMidZ:-.02088,
      templeEndZ:-.10440
    },
    hair:{
      rootX:.305,
      rootY:.255,
      shellX:.34,
      shellY:.29,
      shellZ:.255,
      rootInset:.985,
      layers:[
        {count:34,zSign:-.82,reach:.195,rad:.0068,phase:0},
        {count:30,zSign:0,reach:.170,rad:.0060,phase:.80},
        {count:26,zSign:.82,reach:.145,rad:.0054,phase:1.60}
      ],
      arc:{start:.09,span:.82,reachY:.92,bendWobble:.050,bendCurl:.020,p1:[.16,.24,.18,.12,.18],p2:[.52,.70,.78,.46,.62],p3:[1,1,.74,1,1]}
    }
  }
};

export function partsForMask(name){return MASK_PRESETS[name]?.parts||[];}
export function partPreset(id){for(const mask of Object.values(MASK_PRESETS)){const hit=mask.parts?.find(p=>p.id===id);if(hit)return hit;}return null;}
