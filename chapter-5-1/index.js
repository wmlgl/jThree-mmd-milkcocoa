jThree( function( j3 ) {

    $( "#loading" ).remove();
    j3.Trackball();

    // 3D空間にマーカーオブジェクトを設置する
    var html_txt = "";
    var txr_txt = "";
    var mesh_joint = "";
    $.each(motionData[0].joint, function (key, val) {
        // スプライト用ラベルの生成
        html_txt += '<div id="txt-' + key + '">' + key + '</div>';
        // ラベルテクスチャの生成
        txr_txt += '<txr id="txr-' + key + '" html="#txt-' + key + '" />';
        // スプライトの長さは文字列長に依存
        var sprite_width = key.length * 0.3;
        // Kinectで Right～ 部位は黒くする
        var material = (key.indexOf("Right") != -1)? 'mtl-black':'mtl-red';
        // マーカーオブジェクトの定義
        mesh_joint += '<mesh id="kpos-bindex-' + key + '" geo="#geo-sphere" mtl="#'+material+'" style="positionY: 100 ;"><sprite mtl="#nameMtl" style="positionY: 0.5 ; mtlMap: #txr-' + key + '; scale: ' + sprite_width + ' 1 1;" /></mesh>';
    });
    // ラベル文字列の追加
    j3("import").contents().find("#ContentField").append(html_txt);
    // ラベルテクスチャの追加
    j3("head").append(txr_txt);
    // bodyIndexの数だけ置換して繰り返して、jThreeに追加
    j3("#kinectMarkers").append(function(mesh_joint){
        var str = '';
        for(var i = 0;i<6;i++){
            str += mesh_joint.replace(/bindex/g,i);
        }
        return str;
    }(mesh_joint));


    // MMDのTHREE.jsオブジェクト取得
    var mmd = j3( "mmd" ).three(0);
    // bone情報を取得
    var bones = mmd.children[ 0 ].bones;

    // bone <-> kinect index 変換表作成
    $.each( jointList,function(key,val){
        // bonesをスキャンして操るボーンを探す
        bones.forEach(function(bone,idx){
            if(bone.name===val.name){
                // 操る先のボーンが見つかったらindexを記録する list.jointName.index
                val.index=idx;
                return false;
            }
        });
    });

    // ワールド座標系を更新する
    bones[0].updateMatrixWorld();
    // list に登録された Bones の座標をローカル→ワールド座標変換
    // Bone指標オブジェクトの生成
    var boneHandle = "";
    $.each( jointList, function( key, val ) {
        // 子ボーンが指定されていなかったら(末端なので)終了
        if ( !val.child ) return;
        // 対象のボーン取得
        var bone = bones[ val.index ];
        var child = bones[ jointList[ val.child ].index ];

        // bone位置のワールド座標取得
        var w_boneVector = new THREE.Vector3();
        // 座標をワールド座標に変換
        bone.parent.localToWorld( w_boneVector.copy( bone.position ) );

        // Bone状態を表示させるハンドルオブジェクトの生成
        boneHandle += '<mesh id="bonehandle-' + val.index + '" class="handle" geo="#geo-cube" mtl="#mtl-blue" style="position: '+w_boneVector.x+' '+w_boneVector.y+' '+w_boneVector.z+';"><mesh geo="#geo-corn" mtl="#mtl-blue" style="positionY:0.6;"></mesh></mesh>';
        // コンソールに処理済みのボーン情報を表示(確認用)
        console.log("bone[" + val.index + "] (" + bone.name + ") assoc_kinect[" + key + "] has child: bone[" + jointList[val.child].index + "] (" + child.name + ") assoc_kinect[" + val.child + "]");
    } );
    // Bone状態を表示させるハンドルオブジェクトの生成(jThreeに反映)
    j3("#bonehandles").append(boneHandle);

    // 上半身→首 ベクトルと 左肩→右肩 のベクトル の法線を計測する
    var vc1 = getCrossVector(worldSubVectors(bones[jointList["Neck"].index],bones[jointList["SpineMid"].index])
            ,worldSubVectors(bones[jointList["ShoulderRight"].index],bones[jointList["ShoulderLeft"].index]));
        vc1.normalize();

    // モーション更新関数
    var i = 0
    j3.update( function(d) {
        if (!motionData[i]) {
            j3.update(arguments.callee, false);
            return;
        }

        // bodyIndex取得
        var bodyIndex = motionData[i].bodyIndex;
        // jointデータ取得
        var joints = motionData[i++].joint;

        kinectUpdate(bodyIndex,joints);
        mmdUpdate(joints);
    });

    function kinectUpdate(bodyIndex,joints){
        // オブジェクトの位置をキネクトにあわせる
        $.each(joints,function(key,val){
            var position = new THREE.Vector3();
            // 座標データを拡大してコピー
            position.copy(this).multiplyScalar(13);
            // 該当の関節位置を反映する
            j3("#kpos-" + bodyIndex + "-" + key).css("position","" + position.x + " " + position.y + " " + position.z);
        });
    }

    function mmdUpdate(data){

        // SpineBase を標準位置のベクトルとする
        var basePosition = new THREE.Vector3();
        // 高さのオフセット値(MMDの0点は地面にあるため)
        var mmdOffset = -9;
        // Kinectの値を拡大して jThreeの座標に変換
        basePosition.copy(data.SpineBase).multiplyScalar(13);
        // オフセットの適用
        basePosition.y=basePosition.y + mmdOffset;
        // MMDのボーン位置にベース座標をコピー
        bones[ 0 ].position.copy(basePosition);

        // モデル自体の向き先
        // 上半身→首 ベクトルと 左肩→右肩 のベクトル の法線を計測する
        var vc2 = getCrossVector( getSubVector( getVectorClone(data["Neck"]),getVectorClone(data["SpineMid"]))
                    ,getSubVector( getVectorClone(data["ShoulderRight"]),getVectorClone(data["ShoulderLeft"])));
        vc2.normalize();

        // 法線の角度変化から体の回転を計測する(Y軸のみ)
        var rotation = new THREE.Vector3();
        rotation.set( 0,  vc1.angleTo(vc2),  0);

        // オイラー角をクォータニオンに変換
        bones[ 0 ].quaternion.setFromEuler(rotation, 'XYZ');
        // ワールド座標系を更新
        bones[ 0 ].updateMatrixWorld(true);


        // 胴体-首 , 左肩-左手 , 右肩-右手 , 左腰-左つま先 , 右腰-右つま先 にそれぞれ親から子に遡ってモーションを探索する
        ["SpineMid","ShoulderLeft","ShoulderRight","HipLeft","HipRight"].forEach(function(key,idx){

            while ( jointList[key].child ) {
                var bone = bones[jointList[key].index];
                var childJoint = data[jointList[key].child];

                // Kinect座標データを取得、右手系、親ボーンのローカル座標に変換してから、差分を取得
                // 子関節のローカル座標
                var kinectJointChildPpos = new THREE.Vector3();
                kinectJointChildPpos.copy(childJoint);            // 座標のコピー
                bone.parent.worldToLocal(kinectJointChildPpos);   // ローカル座標変換

                // 現在注目しているの関節のローカル座標
                var kinectJointPos = new THREE.Vector3();
                kinectJointPos.copy(data[key]);                   // 座標のコピー
                bone.parent.worldToLocal(kinectJointPos);         // ローカル座標変換

                // ローカル変換した親子の関節の座標の差を求める
                var jointLocalRot = new THREE.Vector3();
                jointLocalRot.subVectors( kinectJointChildPpos,kinectJointPos);

                // モデル側 子ボーンの定義
                var bone_child = bones[jointList[jointList[key].child].index];
                // 法線ベクトルの定義
                var vecVertical = new THREE.Vector3();
                // ボーンの基本状態のベクトルの定義
                var boneBaseVector = new THREE.Vector3();
                // 子ボーンのローカル座標をボーンの基点とする
                boneBaseVector.copy(  bone_child.position);
                // 各ベクトルの正規化
                boneBaseVector.normalize();
                jointLocalRot.normalize();

                // Kinectの差分から算出したボーン回転のクォータニオンを求める
                bone.quaternion.copy(getQuatanionFromVectors(boneBaseVector,jointLocalRot));

                // 【表示用】ワールド座標系のボーン座標を算出
                var w_boneVector = bone.position.clone();
                bone.parent.localToWorld(w_boneVector);
                // 【表示用】ジョイントハンドルの位置をモデルに合わせる
                j3("#bonehandle-" + jointList[key].index).css('position','' + w_boneVector.x + ' ' + w_boneVector.y + ' ' + w_boneVector.z );
                // 【表示用】決定したクォータニオンをジョイントハンドルにも適用
                j3("#bonehandle-" + jointList[key].index).css('quaternion','' + bone.quaternion.x + ' ' + bone.quaternion.y + ' ' + bone.quaternion.z + ' ' + bone.quaternion.w );

                // ボーンのマトリクスをワールド座標に反映
                bone.updateMatrixWorld(true);
                //bone.parent.updateMatrixWorld(true);

                key = jointList[key].child;
            }
        });

    }

    // ベクトルの複製を取得
    function getVectorClone(pos){
        var v = new THREE.Vector3();
        return v.copy(pos);
    }

    // 差分ベクトルを取得
    function getSubVector(v1, v2){
        var vs = new THREE.Vector3();
        vs.subVectors(v1, v2);
        return vs;
    }

    // 法線ベクトルを取得
    function getCrossVector(v1, v2){
        var vc = new THREE.Vector3();
        vc.crossVectors(v1, v2);
        vc.normalize();
        return vc;
    }

    // ボーン同士のワールド座標の差分ベクトルを取得
    function worldSubVectors(bone1, bone2){
        var v1 = getVectorClone(bone1.position);
        bone1.parent.localToWorld(v1);
        var v2 = getVectorClone(bone2.position);
        bone2.parent.localToWorld(v2);
        return getSubVector(v1, v2);
    }

    // 2本の単位ベクトルのクォータニオンを求める
    // 参照：http://lolengine.net/blog/2014/02/24/quaternion-from-two-vectors-final
    function getQuatanionFromVectors(v1, v2){
        var vecVertical = new THREE.Vector3();
        // ベクトルの内積により回転要素を算出
        var r = v1.dot(v2) + 1;
        if (r < 0.000001) {
            // 内積が0の誤差範囲の場合、法線はz軸かx軸に垂直である とする
            r = 0;
            if (Math.abs(v1.x) > Math.abs(v1.z)) {
                vecVertical.set(-v1.y, v1.x, 0);
            } else {
                vecVertical.set(0, -v1.z, v1.y);
            }
        } else {
            // 目標ベクトルと元ベクトルの法線を算出
            vecVertical.crossVectors(v1, v2);
        }
        // クォータニオンに法線ベクトルと回転を代入
        var q = new THREE.Quaternion();
        q.set(vecVertical.x, vecVertical.y, vecVertical.z, r);
        // クォータニオンを正規化
        q.normalize();
        return q;
    }

},
function() {
    alert( "このブラウザはWebGLに対応していません。" );
} );

// Kinectの間接名
var jointList = {
    SpineMid: {
        name: "上半身",
        child: "Neck"
    },
    Neck: {
        name: "首",
        child: "Head"
    },
    Head: {
        name: "頭"
    },
    ShoulderLeft: {
        name: "左腕",
        child: "ElbowLeft"
    },
    ElbowLeft: {
        name: "左ひじ",
        child: "WristLeft"
    },
    WristLeft: {
        name: "左手首",
        child: "HandLeft"
    },
    HandLeft: {
        name: "左中指１"
    },
    ShoulderRight: {
        name: "右腕",
        child: "ElbowRight"
    },
    ElbowRight: {
        name: "右ひじ",
        child: "WristRight"
    },
    WristRight: {
        name: "右手首",
        child: "HandRight"
    },
    HandRight: {
        name: "右中指１"
    },
    HipLeft: {
        name: "左足",
        child: "KneeLeft"
    },
    KneeLeft: {
        name: "左ひざ",
        child: "AnkleLeft"
    },
    AnkleLeft: {
        name: "左足首",
        child: "FootLeft"
    },
    FootLeft: {
        //name: "左つま先"
        name: "左つま先ＩＫ"
    },
    HipRight: {
        name: "右足",
        child: "KneeRight"
    },
    KneeRight: {
        name: "右ひざ",
        child: "AnkleRight"
    },
    AnkleRight: {
        name: "右足首",
        child: "FootRight"
    },
    FootRight: {
        //name: "右つま先"
        name: "右つま先ＩＫ"
    }
    /*
    SpineShoulder:
    HandTipLeft:
    ThumbLeft: "左親指１",
    HandTipRight:
    ThumbRight: "右親指１"*/
};

var motionData = [
  {
    "bodyIndex": 3,
    "joint": {
      "SpineBase": {
        "x": "0.1166515",
        "y": "-0.05276975",
        "z": "1.599339"
      },
      "SpineMid": {
        "x": "0.1150713",
        "y": "0.2532754",
        "z": "1.568028"
      },
      "Neck": {
        "x": "0.1125305",
        "y": "0.5442983",
        "z": "1.524035"
      },
      "Head": {
        "x": "0.1171212",
        "y": "0.6969755",
        "z": "1.500615"
      },
      "ShoulderLeft": {
        "x": "-0.05750675",
        "y": "0.4148814",
        "z": "1.545458"
      },
      "ElbowLeft": {
        "x": "-0.1718967",
        "y": "0.2244138",
        "z": "1.597716"
      },
      "WristLeft": {
        "x": "-0.2315814",
        "y": "0.04355317",
        "z": "1.536442"
      },
      "HandLeft": {
        "x": "-0.2569415",
        "y": "-0.03165385",
        "z": "1.486298"
      },
      "ShoulderRight": {
        "x": "0.2869881",
        "y": "0.4109205",
        "z": "1.51142"
      },
      "ElbowRight": {
        "x": "0.3712417",
        "y": "0.1988527",
        "z": "1.515925"
      },
      "WristRight": {
        "x": "0.3939014",
        "y": "0.01810756",
        "z": "1.407925"
      },
      "HandRight": {
        "x": "0.3939719",
        "y": "-0.04848276",
        "z": "1.335695"
      },
      "HipLeft": {
        "x": "0.03472912",
        "y": "-0.05066065",
        "z": "1.571345"
      },
      "KneeLeft": {
        "x": "0.01502982",
        "y": "-0.3363405",
        "z": "1.458231"
      },
      "AnkleLeft": {
        "x": "0.04233205",
        "y": "-0.6698315",
        "z": "1.513231"
      },
      "FootLeft": {
        "x": "0.03484768",
        "y": "-0.6953715",
        "z": "1.408395"
      },
      "HipRight": {
        "x": "0.193386",
        "y": "-0.05252728",
        "z": "1.556058"
      },
      "KneeRight": {
        "x": "0.1989516",
        "y": "-0.3921293",
        "z": "1.626759"
      },
      "AnkleRight": {
        "x": "0.1582946",
        "y": "-0.6769487",
        "z": "1.766732"
      },
      "FootRight": {
        "x": "0.1488003",
        "y": "-0.7041606",
        "z": "1.661325"
      },
      "SpineShoulder": {
        "x": "0.1133184",
        "y": "0.4736215",
        "z": "1.537059"
      },
      "HandTipLeft": {
        "x": "-0.2685788",
        "y": "-0.09766701",
        "z": "1.455045"
      },
      "ThumbLeft": {
        "x": "-0.2476086",
        "y": "-0.03834457",
        "z": "1.432111"
      },
      "HandTipRight": {
        "x": "0.3958712",
        "y": "-0.1113237",
        "z": "1.289252"
      },
      "ThumbRight": {
        "x": "0.4221855",
        "y": "-0.06024741",
        "z": "1.303385"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.08687822",
        "y": "-0.04650344",
        "z": "1.711964"
      },
      "SpineMid": {
        "x": "0.09500175",
        "y": "0.2682817",
        "z": "1.684955"
      },
      "Neck": {
        "x": "0.10198",
        "y": "0.568468",
        "z": "1.645881"
      },
      "Head": {
        "x": "0.1063286",
        "y": "0.7220019",
        "z": "1.626546"
      },
      "ShoulderLeft": {
        "x": "-0.06465548",
        "y": "0.4292445",
        "z": "1.635329"
      },
      "ElbowLeft": {
        "x": "-0.1812282",
        "y": "0.2516148",
        "z": "1.631502"
      },
      "WristLeft": {
        "x": "-0.2213762",
        "y": "0.09418505",
        "z": "1.507994"
      },
      "HandLeft": {
        "x": "-0.2208433",
        "y": "0.02271283",
        "z": "1.401266"
      },
      "ShoulderRight": {
        "x": "0.2776122",
        "y": "0.430377",
        "z": "1.643281"
      },
      "ElbowRight": {
        "x": "0.3652092",
        "y": "0.2057117",
        "z": "1.688047"
      },
      "WristRight": {
        "x": "0.4163804",
        "y": "-0.009955652",
        "z": "1.626857"
      },
      "HandRight": {
        "x": "0.4308267",
        "y": "-0.07503957",
        "z": "1.605918"
      },
      "HipLeft": {
        "x": "0.005643927",
        "y": "-0.04554294",
        "z": "1.678213"
      },
      "KneeLeft": {
        "x": "-0.03741368",
        "y": "-0.3245105",
        "z": "1.672628"
      },
      "AnkleLeft": {
        "x": "-0.02140064",
        "y": "-0.6425664",
        "z": "1.931818"
      },
      "FootLeft": {
        "x": "-0.06353864",
        "y": "-0.7227534",
        "z": "1.911078"
      },
      "HipRight": {
        "x": "0.1644336",
        "y": "-0.04545132",
        "z": "1.673343"
      },
      "KneeRight": {
        "x": "0.1918863",
        "y": "-0.3467411",
        "z": "1.68335"
      },
      "AnkleRight": {
        "x": "0.1655434",
        "y": "-0.6626847",
        "z": "1.781008"
      },
      "FootRight": {
        "x": "0.1654565",
        "y": "-0.6917735",
        "z": "1.670086"
      },
      "SpineShoulder": {
        "x": "0.1003964",
        "y": "0.4954259",
        "z": "1.657658"
      },
      "HandTipLeft": {
        "x": "-0.2127784",
        "y": "-0.01774189",
        "z": "1.370049"
      },
      "ThumbLeft": {
        "x": "-0.2296437",
        "y": "0.04433722",
        "z": "1.372239"
      },
      "HandTipRight": {
        "x": "0.44209",
        "y": "-0.1517632",
        "z": "1.603102"
      },
      "ThumbRight": {
        "x": "0.4176963",
        "y": "-0.1208219",
        "z": "1.630385"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.0682296",
        "y": "-0.05174851",
        "z": "1.771984"
      },
      "SpineMid": {
        "x": "0.07938413",
        "y": "0.2662746",
        "z": "1.745038"
      },
      "Neck": {
        "x": "0.08947969",
        "y": "0.569944",
        "z": "1.705289"
      },
      "Head": {
        "x": "0.09365027",
        "y": "0.7260658",
        "z": "1.687655"
      },
      "ShoulderLeft": {
        "x": "-0.07372576",
        "y": "0.4308959",
        "z": "1.685304"
      },
      "ElbowLeft": {
        "x": "-0.1887969",
        "y": "0.2500178",
        "z": "1.649013"
      },
      "WristLeft": {
        "x": "-0.2024543",
        "y": "0.08563835",
        "z": "1.486673"
      },
      "HandLeft": {
        "x": "-0.1892953",
        "y": "0.02309987",
        "z": "1.413333"
      },
      "ShoulderRight": {
        "x": "0.2659694",
        "y": "0.4373271",
        "z": "1.714081"
      },
      "ElbowRight": {
        "x": "0.3478705",
        "y": "0.2044393",
        "z": "1.767989"
      },
      "WristRight": {
        "x": "0.4117216",
        "y": "-0.0004566802",
        "z": "1.720125"
      },
      "HandRight": {
        "x": "0.4318584",
        "y": "-0.07841536",
        "z": "1.702538"
      },
      "HipLeft": {
        "x": "-0.01218964",
        "y": "-0.05227021",
        "z": "1.73572"
      },
      "KneeLeft": {
        "x": "-0.053557",
        "y": "-0.3256666",
        "z": "1.774996"
      },
      "AnkleLeft": {
        "x": "-0.05049871",
        "y": "-0.6276721",
        "z": "2.058698"
      },
      "FootLeft": {
        "x": "-0.09145562",
        "y": "-0.7075207",
        "z": "2.043409"
      },
      "HipRight": {
        "x": "0.1458309",
        "y": "-0.04910019",
        "z": "1.735419"
      },
      "KneeRight": {
        "x": "0.1924298",
        "y": "-0.3386496",
        "z": "1.718375"
      },
      "AnkleRight": {
        "x": "0.1654396",
        "y": "-0.6607635",
        "z": "1.785321"
      },
      "FootRight": {
        "x": "0.1702975",
        "y": "-0.6896982",
        "z": "1.674883"
      },
      "SpineShoulder": {
        "x": "0.08711523",
        "y": "0.4960121",
        "z": "1.717324"
      },
      "HandTipLeft": {
        "x": "-0.1732784",
        "y": "-0.01281603",
        "z": "1.382635"
      },
      "ThumbLeft": {
        "x": "-0.155594",
        "y": "0.0561465",
        "z": "1.382778"
      },
      "HandTipRight": {
        "x": "0.4399523",
        "y": "-0.1559519",
        "z": "1.714361"
      },
      "ThumbRight": {
        "x": "0.3920507",
        "y": "-0.04752018",
        "z": "1.7033"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.06396744",
        "y": "-0.05445898",
        "z": "1.785701"
      },
      "SpineMid": {
        "x": "0.07478605",
        "y": "0.2654473",
        "z": "1.758347"
      },
      "Neck": {
        "x": "0.08452256",
        "y": "0.5709511",
        "z": "1.718341"
      },
      "Head": {
        "x": "0.08928739",
        "y": "0.7271724",
        "z": "1.701264"
      },
      "ShoulderLeft": {
        "x": "-0.07608575",
        "y": "0.430278",
        "z": "1.693506"
      },
      "ElbowLeft": {
        "x": "-0.192316",
        "y": "0.2505475",
        "z": "1.663586"
      },
      "WristLeft": {
        "x": "-0.1985102",
        "y": "0.08381125",
        "z": "1.489403"
      },
      "HandLeft": {
        "x": "-0.1753314",
        "y": "0.02054953",
        "z": "1.429307"
      },
      "ShoulderRight": {
        "x": "0.2621279",
        "y": "0.4384391",
        "z": "1.730828"
      },
      "ElbowRight": {
        "x": "0.3391722",
        "y": "0.2053965",
        "z": "1.79291"
      },
      "WristRight": {
        "x": "0.4055933",
        "y": "0.002017469",
        "z": "1.752949"
      },
      "HandRight": {
        "x": "0.4262019",
        "y": "-0.07640678",
        "z": "1.743531"
      },
      "HipLeft": {
        "x": "-0.01587485",
        "y": "-0.05515281",
        "z": "1.747416"
      },
      "KneeLeft": {
        "x": "-0.05972442",
        "y": "-0.3266805",
        "z": "1.819593"
      },
      "AnkleLeft": {
        "x": "-0.0611121",
        "y": "-0.6223369",
        "z": "2.114123"
      },
      "FootLeft": {
        "x": "-0.09518097",
        "y": "-0.7053214",
        "z": "2.095419"
      },
      "HipRight": {
        "x": "0.1411318",
        "y": "-0.05148095",
        "z": "1.751004"
      },
      "KneeRight": {
        "x": "0.1895055",
        "y": "-0.3367855",
        "z": "1.726563"
      },
      "AnkleRight": {
        "x": "0.164513",
        "y": "-0.6598793",
        "z": "1.791642"
      },
      "FootRight": {
        "x": "0.1713851",
        "y": "-0.688611",
        "z": "1.681669"
      },
      "SpineShoulder": {
        "x": "0.08224797",
        "y": "0.4965619",
        "z": "1.730432"
      },
      "HandTipLeft": {
        "x": "-0.1537999",
        "y": "-0.01731836",
        "z": "1.39909"
      },
      "ThumbLeft": {
        "x": "-0.1357498",
        "y": "0.05262954",
        "z": "1.4006"
      },
      "HandTipRight": {
        "x": "0.4365734",
        "y": "-0.1543417",
        "z": "1.749055"
      },
      "ThumbRight": {
        "x": "0.3856535",
        "y": "-0.04193304",
        "z": "1.74105"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.05433891",
        "y": "-0.05587898",
        "z": "1.817913"
      },
      "SpineMid": {
        "x": "0.06313817",
        "y": "0.2644828",
        "z": "1.789687"
      },
      "Neck": {
        "x": "0.07112307",
        "y": "0.5706871",
        "z": "1.74855"
      },
      "Head": {
        "x": "0.07898859",
        "y": "0.7281363",
        "z": "1.731865"
      },
      "ShoulderLeft": {
        "x": "-0.08382855",
        "y": "0.4290399",
        "z": "1.715527"
      },
      "ElbowLeft": {
        "x": "-0.1944293",
        "y": "0.2511065",
        "z": "1.678128"
      },
      "WristLeft": {
        "x": "-0.1889129",
        "y": "0.08056249",
        "z": "1.508587"
      },
      "HandLeft": {
        "x": "-0.1606796",
        "y": "0.01745897",
        "z": "1.454541"
      },
      "ShoulderRight": {
        "x": "0.2512223",
        "y": "0.4407353",
        "z": "1.76807"
      },
      "ElbowRight": {
        "x": "0.3259609",
        "y": "0.2063939",
        "z": "1.836486"
      },
      "WristRight": {
        "x": "0.3940492",
        "y": "0.002723854",
        "z": "1.801166"
      },
      "HandRight": {
        "x": "0.4197814",
        "y": "-0.07651632",
        "z": "1.785961"
      },
      "HipLeft": {
        "x": "-0.02458739",
        "y": "-0.057468",
        "z": "1.777042"
      },
      "KneeLeft": {
        "x": "-0.0609452",
        "y": "-0.3274011",
        "z": "1.849678"
      },
      "AnkleLeft": {
        "x": "-0.06684303",
        "y": "-0.6161962",
        "z": "2.154481"
      },
      "FootLeft": {
        "x": "-0.09691548",
        "y": "-0.6982383",
        "z": "2.145153"
      },
      "HipRight": {
        "x": "0.1310441",
        "y": "-0.05194905",
        "z": "1.785392"
      },
      "KneeRight": {
        "x": "0.1842925",
        "y": "-0.3344641",
        "z": "1.741073"
      },
      "AnkleRight": {
        "x": "0.164168",
        "y": "-0.6587815",
        "z": "1.794501"
      },
      "FootRight": {
        "x": "0.1746206",
        "y": "-0.6873638",
        "z": "1.685311"
      },
      "SpineShoulder": {
        "x": "0.06925071",
        "y": "0.4960999",
        "z": "1.760961"
      },
      "HandTipLeft": {
        "x": "-0.1373478",
        "y": "-0.02461399",
        "z": "1.425291"
      },
      "ThumbLeft": {
        "x": "-0.1206798",
        "y": "0.0490565",
        "z": "1.428563"
      },
      "HandTipRight": {
        "x": "0.4324701",
        "y": "-0.1521116",
        "z": "1.793629"
      },
      "ThumbRight": {
        "x": "0.4111179",
        "y": "-0.1376436",
        "z": "1.804333"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.04175935",
        "y": "-0.05516682",
        "z": "1.876261"
      },
      "SpineMid": {
        "x": "0.04189944",
        "y": "0.2617547",
        "z": "1.847506"
      },
      "Neck": {
        "x": "0.04171787",
        "y": "0.5651448",
        "z": "1.805842"
      },
      "Head": {
        "x": "0.05231696",
        "y": "0.7217318",
        "z": "1.787862"
      },
      "ShoulderLeft": {
        "x": "-0.1105576",
        "y": "0.4198422",
        "z": "1.770934"
      },
      "ElbowLeft": {
        "x": "-0.2098315",
        "y": "0.244845",
        "z": "1.732481"
      },
      "WristLeft": {
        "x": "-0.1754825",
        "y": "0.07243609",
        "z": "1.571411"
      },
      "HandLeft": {
        "x": "-0.1439192",
        "y": "0.005475955",
        "z": "1.512281"
      },
      "ShoulderRight": {
        "x": "0.226133",
        "y": "0.4386981",
        "z": "1.831175"
      },
      "ElbowRight": {
        "x": "0.2988893",
        "y": "0.2017501",
        "z": "1.910442"
      },
      "WristRight": {
        "x": "0.3708153",
        "y": "0.0003741951",
        "z": "1.874842"
      },
      "HandRight": {
        "x": "0.3947987",
        "y": "-0.07427127",
        "z": "1.861742"
      },
      "HipLeft": {
        "x": "-0.03637367",
        "y": "-0.05854155",
        "z": "1.833709"
      },
      "KneeLeft": {
        "x": "-0.06457069",
        "y": "-0.3198501",
        "z": "1.920102"
      },
      "AnkleLeft": {
        "x": "-0.07792513",
        "y": "-0.616791",
        "z": "2.21937"
      },
      "FootLeft": {
        "x": "-0.0616082",
        "y": "-0.6477417",
        "z": "2.10981"
      },
      "HipRight": {
        "x": "0.1182245",
        "y": "-0.04963181",
        "z": "1.845277"
      },
      "KneeRight": {
        "x": "0.172165",
        "y": "-0.3324309",
        "z": "1.772011"
      },
      "AnkleRight": {
        "x": "0.1635528",
        "y": "-0.6601703",
        "z": "1.800703"
      },
      "FootRight": {
        "x": "0.1756152",
        "y": "-0.6884217",
        "z": "1.692125"
      },
      "SpineShoulder": {
        "x": "0.04181601",
        "y": "0.4911844",
        "z": "1.818411"
      },
      "HandTipLeft": {
        "x": "-0.1156726",
        "y": "-0.03647929",
        "z": "1.485622"
      },
      "ThumbLeft": {
        "x": "-0.1058331",
        "y": "0.04227357",
        "z": "1.500444"
      },
      "HandTipRight": {
        "x": "0.4029043",
        "y": "-0.1488592",
        "z": "1.86848"
      },
      "ThumbRight": {
        "x": "0.3600488",
        "y": "-0.07109315",
        "z": "1.838823"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.03987554",
        "y": "-0.05286716",
        "z": "1.894387"
      },
      "SpineMid": {
        "x": "0.03813675",
        "y": "0.2616613",
        "z": "1.864316"
      },
      "Neck": {
        "x": "0.03614948",
        "y": "0.5629652",
        "z": "1.821844"
      },
      "Head": {
        "x": "0.04512063",
        "y": "0.7189561",
        "z": "1.804453"
      },
      "ShoulderLeft": {
        "x": "-0.1171511",
        "y": "0.4181562",
        "z": "1.786159"
      },
      "ElbowLeft": {
        "x": "-0.2146109",
        "y": "0.2411379",
        "z": "1.745598"
      },
      "WristLeft": {
        "x": "-0.1752554",
        "y": "0.06623629",
        "z": "1.585489"
      },
      "HandLeft": {
        "x": "-0.1404324",
        "y": "-0.002138874",
        "z": "1.543366"
      },
      "ShoulderRight": {
        "x": "0.2177217",
        "y": "0.4370609",
        "z": "1.85227"
      },
      "ElbowRight": {
        "x": "0.2871566",
        "y": "0.2027534",
        "z": "1.937125"
      },
      "WristRight": {
        "x": "0.3544053",
        "y": "0.005843207",
        "z": "1.907614"
      },
      "HandRight": {
        "x": "0.377945",
        "y": "-0.07216765",
        "z": "1.900285"
      },
      "HipLeft": {
        "x": "-0.03747129",
        "y": "-0.05640277",
        "z": "1.851285"
      },
      "KneeLeft": {
        "x": "-0.06811836",
        "y": "-0.3230162",
        "z": "1.949521"
      },
      "AnkleLeft": {
        "x": "-0.07873613",
        "y": "-0.624181",
        "z": "2.234093"
      },
      "FootLeft": {
        "x": "-0.06100675",
        "y": "-0.6551661",
        "z": "2.124749"
      },
      "HipRight": {
        "x": "0.1156163",
        "y": "-0.04727492",
        "z": "1.863936"
      },
      "KneeRight": {
        "x": "0.1658071",
        "y": "-0.3314235",
        "z": "1.786436"
      },
      "AnkleRight": {
        "x": "0.1621693",
        "y": "-0.6589974",
        "z": "1.806138"
      },
      "FootRight": {
        "x": "0.1756702",
        "y": "-0.6873796",
        "z": "1.697743"
      },
      "SpineShoulder": {
        "x": "0.03669624",
        "y": "0.4895017",
        "z": "1.834579"
      },
      "HandTipLeft": {
        "x": "-0.111448",
        "y": "-0.04718982",
        "z": "1.518888"
      },
      "ThumbLeft": {
        "x": "-0.1202079",
        "y": "0.0219073",
        "z": "1.509029"
      },
      "HandTipRight": {
        "x": "0.3871952",
        "y": "-0.1479824",
        "z": "1.902383"
      },
      "ThumbRight": {
        "x": "0.3559887",
        "y": "-0.1082028",
        "z": "1.900556"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.03349129",
        "y": "-0.05487013",
        "z": "1.927436"
      },
      "SpineMid": {
        "x": "0.02720875",
        "y": "0.2580505",
        "z": "1.894071"
      },
      "Neck": {
        "x": "0.02097045",
        "y": "0.5580331",
        "z": "1.848543"
      },
      "Head": {
        "x": "0.03321645",
        "y": "0.7154961",
        "z": "1.827098"
      },
      "ShoulderLeft": {
        "x": "-0.1301939",
        "y": "0.413173",
        "z": "1.81569"
      },
      "ElbowLeft": {
        "x": "-0.2249228",
        "y": "0.2319883",
        "z": "1.776621"
      },
      "WristLeft": {
        "x": "-0.1762833",
        "y": "0.05144086",
        "z": "1.624262"
      },
      "HandLeft": {
        "x": "-0.1411215",
        "y": "-0.01006691",
        "z": "1.577517"
      },
      "ShoulderRight": {
        "x": "0.2023251",
        "y": "0.4335988",
        "z": "1.882476"
      },
      "ElbowRight": {
        "x": "0.2729238",
        "y": "0.2039797",
        "z": "1.969579"
      },
      "WristRight": {
        "x": "0.3408536",
        "y": "0.004991163",
        "z": "1.937122"
      },
      "HandRight": {
        "x": "0.3617752",
        "y": "-0.07308611",
        "z": "1.931576"
      },
      "HipLeft": {
        "x": "-0.04354006",
        "y": "-0.05983672",
        "z": "1.883587"
      },
      "KneeLeft": {
        "x": "-0.07421884",
        "y": "-0.3272991",
        "z": "1.988681"
      },
      "AnkleLeft": {
        "x": "-0.07472317",
        "y": "-0.6270437",
        "z": "2.249379"
      },
      "FootLeft": {
        "x": "-0.08291494",
        "y": "-0.7007673",
        "z": "2.233616"
      },
      "HipRight": {
        "x": "0.1091995",
        "y": "-0.04778314",
        "z": "1.897742"
      },
      "KneeRight": {
        "x": "0.1570928",
        "y": "-0.3316692",
        "z": "1.807043"
      },
      "AnkleRight": {
        "x": "0.1613092",
        "y": "-0.6590396",
        "z": "1.811031"
      },
      "FootRight": {
        "x": "0.1750366",
        "y": "-0.6875695",
        "z": "1.702957"
      },
      "SpineShoulder": {
        "x": "0.0225487",
        "y": "0.4848638",
        "z": "1.862031"
      },
      "HandTipLeft": {
        "x": "-0.1067233",
        "y": "-0.05484017",
        "z": "1.55425"
      },
      "ThumbLeft": {
        "x": "-0.1146122",
        "y": "0.01638158",
        "z": "1.54725"
      },
      "HandTipRight": {
        "x": "0.3711345",
        "y": "-0.1486599",
        "z": "1.93083"
      },
      "ThumbRight": {
        "x": "0.3407135",
        "y": "-0.1095222",
        "z": "1.931167"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.02596029",
        "y": "-0.0560842",
        "z": "1.956344"
      },
      "SpineMid": {
        "x": "0.01828653",
        "y": "0.2552975",
        "z": "1.919296"
      },
      "Neck": {
        "x": "0.0110305",
        "y": "0.5542079",
        "z": "1.869686"
      },
      "Head": {
        "x": "0.01925104",
        "y": "0.711862",
        "z": "1.850475"
      },
      "ShoulderLeft": {
        "x": "-0.1400158",
        "y": "0.4111411",
        "z": "1.838678"
      },
      "ElbowLeft": {
        "x": "-0.2330848",
        "y": "0.2256396",
        "z": "1.795846"
      },
      "WristLeft": {
        "x": "-0.1851104",
        "y": "0.04801652",
        "z": "1.660544"
      },
      "HandLeft": {
        "x": "-0.1439757",
        "y": "-0.01978806",
        "z": "1.612601"
      },
      "ShoulderRight": {
        "x": "0.1903547",
        "y": "0.4327073",
        "z": "1.909088"
      },
      "ElbowRight": {
        "x": "0.2565236",
        "y": "0.2038137",
        "z": "2.00245"
      },
      "WristRight": {
        "x": "0.3250448",
        "y": "0.001673019",
        "z": "1.967239"
      },
      "HandRight": {
        "x": "0.3452915",
        "y": "-0.07408939",
        "z": "1.960052"
      },
      "HipLeft": {
        "x": "-0.05096821",
        "y": "-0.06244011",
        "z": "1.913287"
      },
      "KneeLeft": {
        "x": "-0.0756399",
        "y": "-0.3382736",
        "z": "2.019183"
      },
      "AnkleLeft": {
        "x": "-0.07447995",
        "y": "-0.6291208",
        "z": "2.255849"
      },
      "FootLeft": {
        "x": "-0.0799484",
        "y": "-0.7020649",
        "z": "2.236784"
      },
      "HipRight": {
        "x": "0.101878",
        "y": "-0.04765504",
        "z": "1.925863"
      },
      "KneeRight": {
        "x": "0.1490972",
        "y": "-0.3408077",
        "z": "1.834726"
      },
      "AnkleRight": {
        "x": "0.1589798",
        "y": "-0.6632378",
        "z": "1.819634"
      },
      "FootRight": {
        "x": "0.1550603",
        "y": "-0.730184",
        "z": "1.747132"
      },
      "SpineShoulder": {
        "x": "0.0128094",
        "y": "0.4812537",
        "z": "1.884228"
      },
      "HandTipLeft": {
        "x": "-0.1085681",
        "y": "-0.06764114",
        "z": "1.591955"
      },
      "ThumbLeft": {
        "x": "-0.1412791",
        "y": "-0.01346041",
        "z": "1.567457"
      },
      "HandTipRight": {
        "x": "0.3544254",
        "y": "-0.1508274",
        "z": "1.958243"
      },
      "ThumbRight": {
        "x": "0.3336293",
        "y": "-0.1369646",
        "z": "1.972556"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01893468",
        "y": "-0.05520769",
        "z": "1.983649"
      },
      "SpineMid": {
        "x": "0.007406809",
        "y": "0.2553322",
        "z": "1.945557"
      },
      "Neck": {
        "x": "-0.003954612",
        "y": "0.5534751",
        "z": "1.895071"
      },
      "Head": {
        "x": "0.007094476",
        "y": "0.7115183",
        "z": "1.871711"
      },
      "ShoulderLeft": {
        "x": "-0.1515766",
        "y": "0.4128566",
        "z": "1.865241"
      },
      "ElbowLeft": {
        "x": "-0.2460833",
        "y": "0.2195968",
        "z": "1.832219"
      },
      "WristLeft": {
        "x": "-0.1907936",
        "y": "0.03840141",
        "z": "1.686962"
      },
      "HandLeft": {
        "x": "-0.1531004",
        "y": "-0.02971547",
        "z": "1.649902"
      },
      "ShoulderRight": {
        "x": "0.1752988",
        "y": "0.4367341",
        "z": "1.93662"
      },
      "ElbowRight": {
        "x": "0.241155",
        "y": "0.2036285",
        "z": "2.032197"
      },
      "WristRight": {
        "x": "0.3035292",
        "y": "0.008480456",
        "z": "1.997273"
      },
      "HandRight": {
        "x": "0.3257038",
        "y": "-0.06272206",
        "z": "1.985959"
      },
      "HipLeft": {
        "x": "-0.05777758",
        "y": "-0.06254544",
        "z": "1.939819"
      },
      "KneeLeft": {
        "x": "-0.07983432",
        "y": "-0.3436428",
        "z": "2.045478"
      },
      "AnkleLeft": {
        "x": "-0.0750178",
        "y": "-0.6312668",
        "z": "2.264793"
      },
      "FootLeft": {
        "x": "-0.07810056",
        "y": "-0.7029347",
        "z": "2.239096"
      },
      "HipRight": {
        "x": "0.09491639",
        "y": "-0.04580762",
        "z": "1.953941"
      },
      "KneeRight": {
        "x": "0.142184",
        "y": "-0.3411811",
        "z": "1.861894"
      },
      "AnkleRight": {
        "x": "0.1576812",
        "y": "-0.6651597",
        "z": "1.827625"
      },
      "FootRight": {
        "x": "0.1567831",
        "y": "-0.7308637",
        "z": "1.74588"
      },
      "SpineShoulder": {
        "x": "-0.001133017",
        "y": "0.4806993",
        "z": "1.909837"
      },
      "HandTipLeft": {
        "x": "-0.115325",
        "y": "-0.08017979",
        "z": "1.629312"
      },
      "ThumbLeft": {
        "x": "-0.1216678",
        "y": "5.524487E-05",
        "z": "1.622182"
      },
      "HandTipRight": {
        "x": "0.3362885",
        "y": "-0.1487591",
        "z": "1.986284"
      },
      "ThumbRight": {
        "x": "0.2811899",
        "y": "-0.03352544",
        "z": "1.969429"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.001764089",
        "y": "-0.05051649",
        "z": "2.041428"
      },
      "SpineMid": {
        "x": "-0.01403196",
        "y": "0.2568888",
        "z": "2.002023"
      },
      "Neck": {
        "x": "-0.02920863",
        "y": "0.5523545",
        "z": "1.949841"
      },
      "Head": {
        "x": "-0.02305246",
        "y": "0.7102903",
        "z": "1.922357"
      },
      "ShoulderLeft": {
        "x": "-0.1755555",
        "y": "0.415862",
        "z": "1.920444"
      },
      "ElbowLeft": {
        "x": "-0.2651845",
        "y": "0.2278696",
        "z": "1.893607"
      },
      "WristLeft": {
        "x": "-0.2120707",
        "y": "0.02298257",
        "z": "1.756945"
      },
      "HandLeft": {
        "x": "-0.1745332",
        "y": "-0.0471091",
        "z": "1.719418"
      },
      "ShoulderRight": {
        "x": "0.1508057",
        "y": "0.4422631",
        "z": "1.993694"
      },
      "ElbowRight": {
        "x": "0.2099842",
        "y": "0.2099684",
        "z": "2.095289"
      },
      "WristRight": {
        "x": "0.272904",
        "y": "0.0164082",
        "z": "2.050855"
      },
      "HandRight": {
        "x": "0.2949707",
        "y": "-0.05337773",
        "z": "2.035549"
      },
      "HipLeft": {
        "x": "-0.07490785",
        "y": "-0.0576794",
        "z": "1.996924"
      },
      "KneeLeft": {
        "x": "-0.08550149",
        "y": "-0.3406443",
        "z": "2.070396"
      },
      "AnkleLeft": {
        "x": "-0.0770207",
        "y": "-0.6291306",
        "z": "2.273005"
      },
      "FootLeft": {
        "x": "-0.05703049",
        "y": "-0.6615604",
        "z": "2.163098"
      },
      "HipRight": {
        "x": "0.07834567",
        "y": "-0.04153755",
        "z": "2.012428"
      },
      "KneeRight": {
        "x": "0.125673",
        "y": "-0.3407997",
        "z": "1.929697"
      },
      "AnkleRight": {
        "x": "0.1463138",
        "y": "-0.6519024",
        "z": "1.873793"
      },
      "FootRight": {
        "x": "0.1554295",
        "y": "-0.7095324",
        "z": "1.766777"
      },
      "SpineShoulder": {
        "x": "-0.02550267",
        "y": "0.4801854",
        "z": "1.96508"
      },
      "HandTipLeft": {
        "x": "-0.1414291",
        "y": "-0.1026004",
        "z": "1.71008"
      },
      "ThumbLeft": {
        "x": "-0.1274227",
        "y": "-0.02184109",
        "z": "1.704812"
      },
      "HandTipRight": {
        "x": "0.301374",
        "y": "-0.1329262",
        "z": "2.019439"
      },
      "ThumbRight": {
        "x": "0.2908378",
        "y": "-0.08904709",
        "z": "2.0625"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "-0.003005652",
        "y": "-0.04802794",
        "z": "2.052709"
      },
      "SpineMid": {
        "x": "-0.01853202",
        "y": "0.258828",
        "z": "2.012248"
      },
      "Neck": {
        "x": "-0.03342247",
        "y": "0.5538612",
        "z": "1.959103"
      },
      "Head": {
        "x": "-0.02732441",
        "y": "0.7121207",
        "z": "1.932411"
      },
      "ShoulderLeft": {
        "x": "-0.1807313",
        "y": "0.4174527",
        "z": "1.932417"
      },
      "ElbowLeft": {
        "x": "-0.2698997",
        "y": "0.2268672",
        "z": "1.904571"
      },
      "WristLeft": {
        "x": "-0.2189262",
        "y": "0.02101162",
        "z": "1.774244"
      },
      "HandLeft": {
        "x": "-0.1886208",
        "y": "-0.05332838",
        "z": "1.750687"
      },
      "ShoulderRight": {
        "x": "0.146703",
        "y": "0.4445613",
        "z": "2.003799"
      },
      "ElbowRight": {
        "x": "0.2056",
        "y": "0.2118614",
        "z": "2.105867"
      },
      "WristRight": {
        "x": "0.267934",
        "y": "0.01729906",
        "z": "2.061107"
      },
      "HandRight": {
        "x": "0.2858359",
        "y": "-0.04945403",
        "z": "2.055872"
      },
      "HipLeft": {
        "x": "-0.07951188",
        "y": "-0.05528229",
        "z": "2.008406"
      },
      "KneeLeft": {
        "x": "-0.08942146",
        "y": "-0.3390196",
        "z": "2.080425"
      },
      "AnkleLeft": {
        "x": "-0.07794325",
        "y": "-0.6250943",
        "z": "2.277748"
      },
      "FootLeft": {
        "x": "-0.05824869",
        "y": "-0.6581376",
        "z": "2.167087"
      },
      "HipRight": {
        "x": "0.07358317",
        "y": "-0.03905813",
        "z": "2.023564"
      },
      "KneeRight": {
        "x": "0.1237348",
        "y": "-0.338155",
        "z": "1.93939"
      },
      "AnkleRight": {
        "x": "0.145583",
        "y": "-0.6473101",
        "z": "1.885337"
      },
      "FootRight": {
        "x": "0.1614917",
        "y": "-0.6782296",
        "z": "1.77541"
      },
      "SpineShoulder": {
        "x": "-0.02979146",
        "y": "0.4817875",
        "z": "1.974575"
      },
      "HandTipLeft": {
        "x": "-0.1584308",
        "y": "-0.1137841",
        "z": "1.745153"
      },
      "ThumbLeft": {
        "x": "-0.1391646",
        "y": "-0.03164601",
        "z": "1.737583"
      },
      "HandTipRight": {
        "x": "0.290637",
        "y": "-0.129502",
        "z": "2.033346"
      },
      "ThumbRight": {
        "x": "0.2814696",
        "y": "-0.08465683",
        "z": "2.079833"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "-0.01073906",
        "y": "-0.04317711",
        "z": "2.072394"
      },
      "SpineMid": {
        "x": "-0.02663051",
        "y": "0.2635932",
        "z": "2.031914"
      },
      "Neck": {
        "x": "-0.04181558",
        "y": "0.5586109",
        "z": "1.978732"
      },
      "Head": {
        "x": "-0.03613655",
        "y": "0.7149029",
        "z": "1.951534"
      },
      "ShoulderLeft": {
        "x": "-0.1881442",
        "y": "0.4200748",
        "z": "1.950644"
      },
      "ElbowLeft": {
        "x": "-0.2755414",
        "y": "0.2266243",
        "z": "1.928209"
      },
      "WristLeft": {
        "x": "-0.2259145",
        "y": "0.004973937",
        "z": "1.8009"
      },
      "HandLeft": {
        "x": "-0.2036563",
        "y": "-0.05913517",
        "z": "1.780109"
      },
      "ShoulderRight": {
        "x": "0.1400969",
        "y": "0.4487281",
        "z": "2.023023"
      },
      "ElbowRight": {
        "x": "0.1990208",
        "y": "0.2167017",
        "z": "2.122543"
      },
      "WristRight": {
        "x": "0.2637174",
        "y": "0.01863582",
        "z": "2.070766"
      },
      "HandRight": {
        "x": "0.2792497",
        "y": "-0.04362331",
        "z": "2.070473"
      },
      "HipLeft": {
        "x": "-0.08706299",
        "y": "-0.05075163",
        "z": "2.028673"
      },
      "KneeLeft": {
        "x": "-0.09633149",
        "y": "-0.3399501",
        "z": "2.096405"
      },
      "AnkleLeft": {
        "x": "-0.07838519",
        "y": "-0.6256838",
        "z": "2.282024"
      },
      "FootLeft": {
        "x": "-0.05823658",
        "y": "-0.6593157",
        "z": "2.170366"
      },
      "HipRight": {
        "x": "0.06594351",
        "y": "-0.03408072",
        "z": "2.042724"
      },
      "KneeRight": {
        "x": "0.1186709",
        "y": "-0.3392617",
        "z": "1.954137"
      },
      "AnkleRight": {
        "x": "0.1428754",
        "y": "-0.6544935",
        "z": "1.935154"
      },
      "FootRight": {
        "x": "0.1570218",
        "y": "-0.7080767",
        "z": "1.821945"
      },
      "SpineShoulder": {
        "x": "-0.03812194",
        "y": "0.4865303",
        "z": "1.994217"
      },
      "HandTipLeft": {
        "x": "-0.1748151",
        "y": "-0.1203085",
        "z": "1.773522"
      },
      "ThumbLeft": {
        "x": "-0.1589934",
        "y": "-0.03496888",
        "z": "1.764789"
      },
      "HandTipRight": {
        "x": "0.2889113",
        "y": "-0.120382",
        "z": "2.051671"
      },
      "ThumbRight": {
        "x": "0.2726863",
        "y": "-0.07600381",
        "z": "2.093684"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "-0.01815555",
        "y": "-0.03796518",
        "z": "2.094955"
      },
      "SpineMid": {
        "x": "-0.0326834",
        "y": "0.2685481",
        "z": "2.051849"
      },
      "Neck": {
        "x": "-0.04662993",
        "y": "0.5633993",
        "z": "1.996279"
      },
      "Head": {
        "x": "-0.04417339",
        "y": "0.7216387",
        "z": "1.969894"
      },
      "ShoulderLeft": {
        "x": "-0.1951312",
        "y": "0.4242094",
        "z": "1.971512"
      },
      "ElbowLeft": {
        "x": "-0.2810236",
        "y": "0.2285368",
        "z": "1.950326"
      },
      "WristLeft": {
        "x": "-0.2366589",
        "y": "-0.001106896",
        "z": "1.823089"
      },
      "HandLeft": {
        "x": "-0.2188939",
        "y": "-0.06445853",
        "z": "1.806913"
      },
      "ShoulderRight": {
        "x": "0.1360249",
        "y": "0.4523064",
        "z": "2.038699"
      },
      "ElbowRight": {
        "x": "0.1957169",
        "y": "0.2231951",
        "z": "2.132624"
      },
      "WristRight": {
        "x": "0.2523593",
        "y": "0.03670902",
        "z": "2.096495"
      },
      "HandRight": {
        "x": "0.2772974",
        "y": "-0.03893433",
        "z": "2.081956"
      },
      "HipLeft": {
        "x": "-0.09351725",
        "y": "-0.04603452",
        "z": "2.050797"
      },
      "KneeLeft": {
        "x": "-0.1024347",
        "y": "-0.3386426",
        "z": "2.10988"
      },
      "AnkleLeft": {
        "x": "-0.07946304",
        "y": "-0.625071",
        "z": "2.286186"
      },
      "FootLeft": {
        "x": "-0.06053731",
        "y": "-0.6599454",
        "z": "2.174484"
      },
      "HipRight": {
        "x": "0.0577962",
        "y": "-0.0285585",
        "z": "2.065768"
      },
      "KneeRight": {
        "x": "0.1133489",
        "y": "-0.3233372",
        "z": "1.972671"
      },
      "AnkleRight": {
        "x": "0.1414562",
        "y": "-0.6551769",
        "z": "1.977374"
      },
      "FootRight": {
        "x": "0.1535645",
        "y": "-0.7216797",
        "z": "1.882813"
      },
      "SpineShoulder": {
        "x": "-0.04323583",
        "y": "0.4913506",
        "z": "2.012341"
      },
      "HandTipLeft": {
        "x": "-0.188475",
        "y": "-0.1253982",
        "z": "1.799981"
      },
      "ThumbLeft": {
        "x": "-0.1713502",
        "y": "-0.04383866",
        "z": "1.7864"
      },
      "HandTipRight": {
        "x": "0.2836401",
        "y": "-0.1180315",
        "z": "2.06304"
      },
      "ThumbRight": {
        "x": "0.2689185",
        "y": "-0.06778898",
        "z": "2.1034"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "-0.0236663",
        "y": "-0.03203067",
        "z": "2.110135"
      },
      "SpineMid": {
        "x": "-0.03706866",
        "y": "0.2734757",
        "z": "2.066512"
      },
      "Neck": {
        "x": "-0.04988523",
        "y": "0.5674563",
        "z": "2.010334"
      },
      "Head": {
        "x": "-0.04921408",
        "y": "0.7270335",
        "z": "1.985399"
      },
      "ShoulderLeft": {
        "x": "-0.1975829",
        "y": "0.4259416",
        "z": "1.979299"
      },
      "ElbowLeft": {
        "x": "-0.2849751",
        "y": "0.2271536",
        "z": "1.971282"
      },
      "WristLeft": {
        "x": "-0.2476363",
        "y": "-0.004167601",
        "z": "1.847614"
      },
      "HandLeft": {
        "x": "-0.2331761",
        "y": "-0.06688084",
        "z": "1.835069"
      },
      "ShoulderRight": {
        "x": "0.133099",
        "y": "0.4568032",
        "z": "2.052324"
      },
      "ElbowRight": {
        "x": "0.1947597",
        "y": "0.2269598",
        "z": "2.139916"
      },
      "WristRight": {
        "x": "0.2510403",
        "y": "0.04065251",
        "z": "2.100171"
      },
      "HandRight": {
        "x": "0.2780309",
        "y": "-0.03297831",
        "z": "2.090666"
      },
      "HipLeft": {
        "x": "-0.0990457",
        "y": "-0.03975708",
        "z": "2.0662"
      },
      "KneeLeft": {
        "x": "-0.106515",
        "y": "-0.3379617",
        "z": "2.121117"
      },
      "AnkleLeft": {
        "x": "-0.07945509",
        "y": "-0.6253459",
        "z": "2.290036"
      },
      "FootLeft": {
        "x": "-0.05897885",
        "y": "-0.6605712",
        "z": "2.178171"
      },
      "HipRight": {
        "x": "0.05250575",
        "y": "-0.02318368",
        "z": "2.080754"
      },
      "KneeRight": {
        "x": "0.1105504",
        "y": "-0.3183672",
        "z": "1.987531"
      },
      "AnkleRight": {
        "x": "0.1342016",
        "y": "-0.6450613",
        "z": "2.032018"
      },
      "FootRight": {
        "x": "0.1567338",
        "y": "-0.7191574",
        "z": "1.941154"
      },
      "SpineShoulder": {
        "x": "-0.04677337",
        "y": "0.4956092",
        "z": "2.026559"
      },
      "HandTipLeft": {
        "x": "-0.2049154",
        "y": "-0.1297005",
        "z": "1.833952"
      },
      "ThumbLeft": {
        "x": "-0.1862158",
        "y": "-0.05267015",
        "z": "1.809059"
      },
      "HandTipRight": {
        "x": "0.2874424",
        "y": "-0.1122767",
        "z": "2.074497"
      },
      "ThumbRight": {
        "x": "0.2743075",
        "y": "-0.06852984",
        "z": "2.116667"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "-0.02606002",
        "y": "-0.02653295",
        "z": "2.124667"
      },
      "SpineMid": {
        "x": "-0.0399994",
        "y": "0.2792402",
        "z": "2.081824"
      },
      "Neck": {
        "x": "-0.05329361",
        "y": "0.5735278",
        "z": "2.026448"
      },
      "Head": {
        "x": "-0.0535842",
        "y": "0.7329859",
        "z": "2.003021"
      },
      "ShoulderLeft": {
        "x": "-0.2049764",
        "y": "0.4329941",
        "z": "2.009214"
      },
      "ElbowLeft": {
        "x": "-0.289824",
        "y": "0.2258033",
        "z": "1.993053"
      },
      "WristLeft": {
        "x": "-0.2600595",
        "y": "-0.004156127",
        "z": "1.873533"
      },
      "HandLeft": {
        "x": "-0.2488198",
        "y": "-0.06912009",
        "z": "1.860736"
      },
      "ShoulderRight": {
        "x": "0.1306616",
        "y": "0.4617995",
        "z": "2.064233"
      },
      "ElbowRight": {
        "x": "0.1952429",
        "y": "0.233303",
        "z": "2.144966"
      },
      "WristRight": {
        "x": "0.2511433",
        "y": "0.04670502",
        "z": "2.104428"
      },
      "HandRight": {
        "x": "0.2816926",
        "y": "-0.02742913",
        "z": "2.090094"
      },
      "HipLeft": {
        "x": "-0.1013577",
        "y": "-0.03434695",
        "z": "2.080786"
      },
      "KneeLeft": {
        "x": "-0.1102676",
        "y": "-0.3377129",
        "z": "2.132666"
      },
      "AnkleLeft": {
        "x": "-0.07998744",
        "y": "-0.6252114",
        "z": "2.291417"
      },
      "FootLeft": {
        "x": "-0.06402773",
        "y": "-0.6605599",
        "z": "2.178601"
      },
      "HipRight": {
        "x": "0.050113",
        "y": "-0.0178026",
        "z": "2.095264"
      },
      "KneeRight": {
        "x": "0.1100743",
        "y": "-0.31005",
        "z": "2.009433"
      },
      "AnkleRight": {
        "x": "0.1381192",
        "y": "-0.6438118",
        "z": "2.084818"
      },
      "FootRight": {
        "x": "0.1486816",
        "y": "-0.7109375",
        "z": "2.001953"
      },
      "SpineShoulder": {
        "x": "-0.05007064",
        "y": "0.5015979",
        "z": "2.042472"
      },
      "HandTipLeft": {
        "x": "-0.2233155",
        "y": "-0.1318398",
        "z": "1.86002"
      },
      "ThumbLeft": {
        "x": "-0.2011278",
        "y": "-0.05806578",
        "z": "1.832286"
      },
      "HandTipRight": {
        "x": "0.2918114",
        "y": "-0.1043209",
        "z": "2.075489"
      },
      "ThumbRight": {
        "x": "0.2804332",
        "y": "-0.06341556",
        "z": "2.115533"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "-0.02585627",
        "y": "-0.02299666",
        "z": "2.138719"
      },
      "SpineMid": {
        "x": "-0.04089187",
        "y": "0.2835399",
        "z": "2.096377"
      },
      "Neck": {
        "x": "-0.05527758",
        "y": "0.5786794",
        "z": "2.041615"
      },
      "Head": {
        "x": "-0.05596606",
        "y": "0.7360192",
        "z": "2.016603"
      },
      "ShoulderLeft": {
        "x": "-0.2082185",
        "y": "0.4357618",
        "z": "2.022608"
      },
      "ElbowLeft": {
        "x": "-0.2939855",
        "y": "0.2264791",
        "z": "2.014293"
      },
      "WristLeft": {
        "x": "-0.2746322",
        "y": "-0.0006027603",
        "z": "1.904792"
      },
      "HandLeft": {
        "x": "-0.2659195",
        "y": "-0.06816843",
        "z": "1.886592"
      },
      "ShoulderRight": {
        "x": "0.1292309",
        "y": "0.4646728",
        "z": "2.073632"
      },
      "ElbowRight": {
        "x": "0.1966562",
        "y": "0.2396264",
        "z": "2.150458"
      },
      "WristRight": {
        "x": "0.2526905",
        "y": "0.05317692",
        "z": "2.107813"
      },
      "HandRight": {
        "x": "0.2868593",
        "y": "-0.0230507",
        "z": "2.084901"
      },
      "HipLeft": {
        "x": "-0.1013569",
        "y": "-0.0314717",
        "z": "2.097028"
      },
      "KneeLeft": {
        "x": "-0.1113545",
        "y": "-0.3365536",
        "z": "2.137874"
      },
      "AnkleLeft": {
        "x": "-0.07948932",
        "y": "-0.6259419",
        "z": "2.294662"
      },
      "FootLeft": {
        "x": "-0.06459309",
        "y": "-0.6611904",
        "z": "2.181762"
      },
      "HipRight": {
        "x": "0.05048734",
        "y": "-0.01381808",
        "z": "2.107368"
      },
      "KneeRight": {
        "x": "0.1096218",
        "y": "-0.3055812",
        "z": "2.035082"
      },
      "AnkleRight": {
        "x": "0.1377617",
        "y": "-0.6397854",
        "z": "2.122001"
      },
      "FootRight": {
        "x": "0.1483154",
        "y": "-0.7089844",
        "z": "2.054688"
      },
      "SpineShoulder": {
        "x": "-0.05178299",
        "y": "0.5065258",
        "z": "2.057475"
      },
      "HandTipLeft": {
        "x": "-0.2431345",
        "y": "-0.1329357",
        "z": "1.886126"
      },
      "ThumbLeft": {
        "x": "-0.2222539",
        "y": "-0.05371338",
        "z": "1.861083"
      },
      "HandTipRight": {
        "x": "0.2963998",
        "y": "-0.0993189",
        "z": "2.072617"
      },
      "ThumbRight": {
        "x": "0.2854173",
        "y": "-0.05126054",
        "z": "2.1165"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "-0.02545521",
        "y": "-0.02083319",
        "z": "2.151592"
      },
      "SpineMid": {
        "x": "-0.04134259",
        "y": "0.2857967",
        "z": "2.110317"
      },
      "Neck": {
        "x": "-0.05657088",
        "y": "0.5810502",
        "z": "2.056613"
      },
      "Head": {
        "x": "-0.05813548",
        "y": "0.7387411",
        "z": "2.031204"
      },
      "ShoulderLeft": {
        "x": "-0.2114284",
        "y": "0.4377829",
        "z": "2.040346"
      },
      "ElbowLeft": {
        "x": "-0.2993812",
        "y": "0.2227114",
        "z": "2.038875"
      },
      "WristLeft": {
        "x": "-0.2927391",
        "y": "0.01360017",
        "z": "1.944416"
      },
      "HandLeft": {
        "x": "-0.2818126",
        "y": "-0.06109045",
        "z": "1.907706"
      },
      "ShoulderRight": {
        "x": "0.1292971",
        "y": "0.4644821",
        "z": "2.073486"
      },
      "ElbowRight": {
        "x": "0.1991916",
        "y": "0.2426886",
        "z": "2.154382"
      },
      "WristRight": {
        "x": "0.2547888",
        "y": "0.05638319",
        "z": "2.10834"
      },
      "HandRight": {
        "x": "0.2914337",
        "y": "-0.01785361",
        "z": "2.077245"
      },
      "HipLeft": {
        "x": "-0.1016268",
        "y": "-0.02892193",
        "z": "2.109186"
      },
      "KneeLeft": {
        "x": "-0.1128698",
        "y": "-0.3353492",
        "z": "2.146365"
      },
      "AnkleLeft": {
        "x": "-0.07991859",
        "y": "-0.626151",
        "z": "2.296437"
      },
      "FootLeft": {
        "x": "-0.06949595",
        "y": "-0.6612559",
        "z": "2.18329"
      },
      "HipRight": {
        "x": "0.05158362",
        "y": "-0.01210716",
        "z": "2.120824"
      },
      "KneeRight": {
        "x": "0.1118299",
        "y": "-0.3060418",
        "z": "2.057447"
      },
      "AnkleRight": {
        "x": "0.1427353",
        "y": "-0.6408828",
        "z": "2.184557"
      },
      "FootRight": {
        "x": "0.152832",
        "y": "-0.703125",
        "z": "2.123047"
      },
      "SpineShoulder": {
        "x": "-0.0528685",
        "y": "0.5088627",
        "z": "2.072212"
      },
      "HandTipLeft": {
        "x": "-0.2602772",
        "y": "-0.1248037",
        "z": "1.89556"
      },
      "ThumbLeft": {
        "x": "-0.2406107",
        "y": "-0.05661984",
        "z": "1.869769"
      },
      "HandTipRight": {
        "x": "0.3031428",
        "y": "-0.09438242",
        "z": "2.064723"
      },
      "ThumbRight": {
        "x": "0.283773",
        "y": "-0.04991444",
        "z": "2.090875"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "-0.02541274",
        "y": "-0.01909416",
        "z": "2.163822"
      },
      "SpineMid": {
        "x": "-0.04108556",
        "y": "0.2875149",
        "z": "2.123189"
      },
      "Neck": {
        "x": "-0.05604838",
        "y": "0.582783",
        "z": "2.070093"
      },
      "Head": {
        "x": "-0.05859714",
        "y": "0.7410274",
        "z": "2.045169"
      },
      "ShoulderLeft": {
        "x": "-0.2137352",
        "y": "0.4399433",
        "z": "2.062615"
      },
      "ElbowLeft": {
        "x": "-0.3013098",
        "y": "0.2258517",
        "z": "2.061382"
      },
      "WristLeft": {
        "x": "-0.3037684",
        "y": "0.01986554",
        "z": "1.968953"
      },
      "HandLeft": {
        "x": "-0.29449",
        "y": "-0.06015991",
        "z": "1.933606"
      },
      "ShoulderRight": {
        "x": "0.1294563",
        "y": "0.4642707",
        "z": "2.073638"
      },
      "ElbowRight": {
        "x": "0.2025347",
        "y": "0.2465544",
        "z": "2.157021"
      },
      "WristRight": {
        "x": "0.2574602",
        "y": "0.06026676",
        "z": "2.108545"
      },
      "HandRight": {
        "x": "0.2939019",
        "y": "-0.01130523",
        "z": "2.067963"
      },
      "HipLeft": {
        "x": "-0.1017088",
        "y": "-0.02674176",
        "z": "2.123546"
      },
      "KneeLeft": {
        "x": "-0.1141835",
        "y": "-0.335463",
        "z": "2.154212"
      },
      "AnkleLeft": {
        "x": "-0.08156706",
        "y": "-0.6237782",
        "z": "2.298411"
      },
      "FootLeft": {
        "x": "-0.07655925",
        "y": "-0.6588041",
        "z": "2.18535"
      },
      "HipRight": {
        "x": "0.05172011",
        "y": "-0.01079224",
        "z": "2.131049"
      },
      "KneeRight": {
        "x": "0.1150551",
        "y": "-0.3080752",
        "z": "2.087077"
      },
      "AnkleRight": {
        "x": "0.1476085",
        "y": "-0.6388236",
        "z": "2.228855"
      },
      "FootRight": {
        "x": "0.1570533",
        "y": "-0.7039697",
        "z": "2.182509"
      },
      "SpineShoulder": {
        "x": "-0.05241624",
        "y": "0.5105851",
        "z": "2.085544"
      },
      "HandTipLeft": {
        "x": "-0.275211",
        "y": "-0.1257575",
        "z": "1.92179"
      },
      "ThumbLeft": {
        "x": "-0.2567189",
        "y": "-0.05689856",
        "z": "1.892824"
      },
      "HandTipRight": {
        "x": "0.310273",
        "y": "-0.08695623",
        "z": "2.050857"
      },
      "ThumbRight": {
        "x": "0.2816647",
        "y": "-0.03768777",
        "z": "2.0836"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "-0.02070208",
        "y": "-0.01689739",
        "z": "2.191697"
      },
      "SpineMid": {
        "x": "-0.03626445",
        "y": "0.2905165",
        "z": "2.153159"
      },
      "Neck": {
        "x": "-0.05112729",
        "y": "0.5867482",
        "z": "2.102254"
      },
      "Head": {
        "x": "-0.05569879",
        "y": "0.7450551",
        "z": "2.07942"
      },
      "ShoulderLeft": {
        "x": "-0.210888",
        "y": "0.4431792",
        "z": "2.101842"
      },
      "ElbowLeft": {
        "x": "-0.3016049",
        "y": "0.2334645",
        "z": "2.128859"
      },
      "WristLeft": {
        "x": "-0.3240243",
        "y": "0.02725928",
        "z": "2.037006"
      },
      "HandLeft": {
        "x": "-0.317458",
        "y": "-0.05329392",
        "z": "1.986693"
      },
      "ShoulderRight": {
        "x": "0.1332995",
        "y": "0.4673647",
        "z": "2.117824"
      },
      "ElbowRight": {
        "x": "0.2087747",
        "y": "0.2512709",
        "z": "2.159086"
      },
      "WristRight": {
        "x": "0.2602765",
        "y": "0.06556266",
        "z": "2.103628"
      },
      "HandRight": {
        "x": "0.2977872",
        "y": "-0.005007317",
        "z": "2.050367"
      },
      "HipLeft": {
        "x": "-0.0965308",
        "y": "-0.02343406",
        "z": "2.154347"
      },
      "KneeLeft": {
        "x": "-0.115234",
        "y": "-0.3304416",
        "z": "2.182369"
      },
      "AnkleLeft": {
        "x": "-0.08309177",
        "y": "-0.6202884",
        "z": "2.303015"
      },
      "FootLeft": {
        "x": "-0.0769134",
        "y": "-0.6550786",
        "z": "2.189928"
      },
      "HipRight": {
        "x": "0.05582321",
        "y": "-0.009695314",
        "z": "2.155918"
      },
      "KneeRight": {
        "x": "0.1227446",
        "y": "-0.3065183",
        "z": "2.14463"
      },
      "AnkleRight": {
        "x": "0.1546441",
        "y": "-0.6101503",
        "z": "2.313714"
      },
      "FootRight": {
        "x": "0.1616211",
        "y": "-0.6850586",
        "z": "2.271484"
      },
      "SpineShoulder": {
        "x": "-0.04751583",
        "y": "0.5142876",
        "z": "2.117153"
      },
      "HandTipLeft": {
        "x": "-0.3004691",
        "y": "-0.1222375",
        "z": "1.965167"
      },
      "ThumbLeft": {
        "x": "-0.2905109",
        "y": "-0.05011317",
        "z": "1.938923"
      },
      "HandTipRight": {
        "x": "0.3154007",
        "y": "-0.07901617",
        "z": "2.023838"
      },
      "ThumbRight": {
        "x": "0.3105687",
        "y": "-0.04672651",
        "z": "2.0758"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "-0.018053",
        "y": "-0.01589234",
        "z": "2.199913"
      },
      "SpineMid": {
        "x": "-0.03362752",
        "y": "0.291521",
        "z": "2.159858"
      },
      "Neck": {
        "x": "-0.04856038",
        "y": "0.587743",
        "z": "2.107568"
      },
      "Head": {
        "x": "-0.05472312",
        "y": "0.7459717",
        "z": "2.086541"
      },
      "ShoulderLeft": {
        "x": "-0.2081565",
        "y": "0.4447376",
        "z": "2.110798"
      },
      "ElbowLeft": {
        "x": "-0.2986715",
        "y": "0.2384149",
        "z": "2.139352"
      },
      "WristLeft": {
        "x": "-0.3231243",
        "y": "0.04546618",
        "z": "2.068699"
      },
      "HandLeft": {
        "x": "-0.3253807",
        "y": "-0.04420993",
        "z": "2.01608"
      },
      "ShoulderRight": {
        "x": "0.1339628",
        "y": "0.4677548",
        "z": "2.118885"
      },
      "ElbowRight": {
        "x": "0.2133162",
        "y": "0.254664",
        "z": "2.160128"
      },
      "WristRight": {
        "x": "0.2636234",
        "y": "0.07063736",
        "z": "2.097422"
      },
      "HandRight": {
        "x": "0.2996889",
        "y": "-0.002210357",
        "z": "2.035494"
      },
      "HipLeft": {
        "x": "-0.09392203",
        "y": "-0.0225367",
        "z": "2.162574"
      },
      "KneeLeft": {
        "x": "-0.114974",
        "y": "-0.3283488",
        "z": "2.191263"
      },
      "AnkleLeft": {
        "x": "-0.08379439",
        "y": "-0.6171326",
        "z": "2.305513"
      },
      "FootLeft": {
        "x": "-0.07948314",
        "y": "-0.6521167",
        "z": "2.192568"
      },
      "HipRight": {
        "x": "0.05840695",
        "y": "-0.008665096",
        "z": "2.164046"
      },
      "KneeRight": {
        "x": "0.1222901",
        "y": "-0.3074234",
        "z": "2.155665"
      },
      "AnkleRight": {
        "x": "0.1558914",
        "y": "-0.6195422",
        "z": "2.335048"
      },
      "FootRight": {
        "x": "0.1644951",
        "y": "-0.6898709",
        "z": "2.285387"
      },
      "SpineShoulder": {
        "x": "-0.0449251",
        "y": "0.5152853",
        "z": "2.122801"
      },
      "HandTipLeft": {
        "x": "-0.3137979",
        "y": "-0.1196227",
        "z": "1.987919"
      },
      "ThumbLeft": {
        "x": "-0.3281576",
        "y": "-0.0466936",
        "z": "1.9695"
      },
      "HandTipRight": {
        "x": "0.3176016",
        "y": "-0.08061808",
        "z": "2.003533"
      },
      "ThumbRight": {
        "x": "0.3118767",
        "y": "-0.04022967",
        "z": "2.058333"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "-0.0139611",
        "y": "-0.01562149",
        "z": "2.210188"
      },
      "SpineMid": {
        "x": "-0.02868017",
        "y": "0.2926045",
        "z": "2.171305"
      },
      "Neck": {
        "x": "-0.0427319",
        "y": "0.589745",
        "z": "2.120107"
      },
      "Head": {
        "x": "-0.04986021",
        "y": "0.7477121",
        "z": "2.099254"
      },
      "ShoulderLeft": {
        "x": "-0.2044637",
        "y": "0.4456904",
        "z": "2.126105"
      },
      "ElbowLeft": {
        "x": "-0.2917115",
        "y": "0.2430049",
        "z": "2.161826"
      },
      "WristLeft": {
        "x": "-0.3203132",
        "y": "0.0542671",
        "z": "2.100175"
      },
      "HandLeft": {
        "x": "-0.331104",
        "y": "-0.03164218",
        "z": "2.044476"
      },
      "ShoulderRight": {
        "x": "0.1367429",
        "y": "0.4690491",
        "z": "2.123214"
      },
      "ElbowRight": {
        "x": "0.2183011",
        "y": "0.2578894",
        "z": "2.162227"
      },
      "WristRight": {
        "x": "0.2656745",
        "y": "0.07551323",
        "z": "2.09213"
      },
      "HandRight": {
        "x": "0.3014204",
        "y": "0.004184205",
        "z": "2.028196"
      },
      "HipLeft": {
        "x": "-0.08959036",
        "y": "-0.02182548",
        "z": "2.173715"
      },
      "KneeLeft": {
        "x": "-0.1142616",
        "y": "-0.3263846",
        "z": "2.202634"
      },
      "AnkleLeft": {
        "x": "-0.08463708",
        "y": "-0.614122",
        "z": "2.310256"
      },
      "FootLeft": {
        "x": "-0.08297454",
        "y": "-0.6490276",
        "z": "2.197404"
      },
      "HipRight": {
        "x": "0.06214047",
        "y": "-0.008835856",
        "z": "2.173485"
      },
      "KneeRight": {
        "x": "0.1293409",
        "y": "-0.3036593",
        "z": "2.182449"
      },
      "AnkleRight": {
        "x": "0.1572676",
        "y": "-0.6167534",
        "z": "2.35751"
      },
      "FootRight": {
        "x": "0.1588907",
        "y": "-0.6840885",
        "z": "2.322777"
      },
      "SpineShoulder": {
        "x": "-0.03931454",
        "y": "0.5170466",
        "z": "2.135077"
      },
      "HandTipLeft": {
        "x": "-0.3286338",
        "y": "-0.1072102",
        "z": "2.004045"
      },
      "ThumbLeft": {
        "x": "-0.3169391",
        "y": "-0.02859136",
        "z": "1.998682"
      },
      "HandTipRight": {
        "x": "0.3222518",
        "y": "-0.06582903",
        "z": "1.994408"
      },
      "ThumbRight": {
        "x": "0.3142399",
        "y": "-0.03463647",
        "z": "2.061584"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "-0.007454736",
        "y": "-0.01675447",
        "z": "2.220731"
      },
      "SpineMid": {
        "x": "-0.0219011",
        "y": "0.2926109",
        "z": "2.181139"
      },
      "Neck": {
        "x": "-0.03572707",
        "y": "0.5908199",
        "z": "2.129236"
      },
      "Head": {
        "x": "-0.04482685",
        "y": "0.7492986",
        "z": "2.110322"
      },
      "ShoulderLeft": {
        "x": "-0.2006555",
        "y": "0.4455388",
        "z": "2.137901"
      },
      "ElbowLeft": {
        "x": "-0.2841291",
        "y": "0.2418626",
        "z": "2.182937"
      },
      "WristLeft": {
        "x": "-0.3193729",
        "y": "0.05618868",
        "z": "2.115564"
      },
      "HandLeft": {
        "x": "-0.3335662",
        "y": "-0.02984809",
        "z": "2.06405"
      },
      "ShoulderRight": {
        "x": "0.1412432",
        "y": "0.4693943",
        "z": "2.128843"
      },
      "ElbowRight": {
        "x": "0.2243449",
        "y": "0.2612045",
        "z": "2.163662"
      },
      "WristRight": {
        "x": "0.2679872",
        "y": "0.08051699",
        "z": "2.086555"
      },
      "HandRight": {
        "x": "0.3013599",
        "y": "0.009999735",
        "z": "2.015858"
      },
      "HipLeft": {
        "x": "-0.08275293",
        "y": "-0.02211966",
        "z": "2.185843"
      },
      "KneeLeft": {
        "x": "-0.1132585",
        "y": "-0.3254083",
        "z": "2.210843"
      },
      "AnkleLeft": {
        "x": "-0.08486978",
        "y": "-0.6121132",
        "z": "2.313323"
      },
      "FootLeft": {
        "x": "-0.08466478",
        "y": "-0.6470188",
        "z": "2.200787"
      },
      "HipRight": {
        "x": "0.06813325",
        "y": "-0.01070957",
        "z": "2.18256"
      },
      "KneeRight": {
        "x": "0.1371903",
        "y": "-0.3062272",
        "z": "2.21011"
      },
      "AnkleRight": {
        "x": "0.158346",
        "y": "-0.6154717",
        "z": "2.37171"
      },
      "FootRight": {
        "x": "0.1582865",
        "y": "-0.682483",
        "z": "2.330176"
      },
      "SpineShoulder": {
        "x": "-0.03235884",
        "y": "0.5178593",
        "z": "2.144383"
      },
      "HandTipLeft": {
        "x": "-0.334903",
        "y": "-0.1054003",
        "z": "2.032264"
      },
      "ThumbLeft": {
        "x": "-0.323177",
        "y": "-0.02257351",
        "z": "2.0145"
      },
      "HandTipRight": {
        "x": "0.3244902",
        "y": "-0.06223858",
        "z": "1.977268"
      },
      "ThumbRight": {
        "x": "0.314145",
        "y": "-0.02382217",
        "z": "2.0548"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.02472158",
        "y": "-0.02080933",
        "z": "2.280599"
      },
      "SpineMid": {
        "x": "0.02709378",
        "y": "0.2909649",
        "z": "2.238376"
      },
      "Neck": {
        "x": "0.03054107",
        "y": "0.5919082",
        "z": "2.183974"
      },
      "Head": {
        "x": "0.01597402",
        "y": "0.7493389",
        "z": "2.168356"
      },
      "ShoulderLeft": {
        "x": "-0.1401444",
        "y": "0.4502574",
        "z": "2.199431"
      },
      "ElbowLeft": {
        "x": "-0.2301271",
        "y": "0.2520244",
        "z": "2.25194"
      },
      "WristLeft": {
        "x": "-0.296374",
        "y": "0.08244523",
        "z": "2.169035"
      },
      "HandLeft": {
        "x": "-0.3387267",
        "y": "0.02931508",
        "z": "2.107207"
      },
      "ShoulderRight": {
        "x": "0.1901845",
        "y": "0.4636728",
        "z": "2.171319"
      },
      "ElbowRight": {
        "x": "0.2894849",
        "y": "0.2808785",
        "z": "2.182693"
      },
      "WristRight": {
        "x": "0.3265228",
        "y": "0.130352",
        "z": "2.052488"
      },
      "HandRight": {
        "x": "0.3555555",
        "y": "0.09754032",
        "z": "1.966232"
      },
      "HipLeft": {
        "x": "-0.0513306",
        "y": "-0.020528",
        "z": "2.248736"
      },
      "KneeLeft": {
        "x": "-0.09939875",
        "y": "-0.3191416",
        "z": "2.24697"
      },
      "AnkleLeft": {
        "x": "-0.07989608",
        "y": "-0.6149337",
        "z": "2.324674"
      },
      "FootLeft": {
        "x": "-0.08225837",
        "y": "-0.6904528",
        "z": "2.272239"
      },
      "HipRight": {
        "x": "0.1000231",
        "y": "-0.02048857",
        "z": "2.239289"
      },
      "KneeRight": {
        "x": "0.1475722",
        "y": "-0.3151348",
        "z": "2.276583"
      },
      "AnkleRight": {
        "x": "0.1619161",
        "y": "-0.6128586",
        "z": "2.396258"
      },
      "FootRight": {
        "x": "0.1564752",
        "y": "-0.6812947",
        "z": "2.347308"
      },
      "SpineShoulder": {
        "x": "0.0296025",
        "y": "0.5182298",
        "z": "2.199784"
      },
      "HandTipLeft": {
        "x": "-0.3737428",
        "y": "-0.02662789",
        "z": "2.054063"
      },
      "ThumbLeft": {
        "x": "-0.3329862",
        "y": "0.05396717",
        "z": "2.048889"
      },
      "HandTipRight": {
        "x": "0.3892904",
        "y": "0.06267032",
        "z": "1.88603"
      },
      "ThumbRight": {
        "x": "0.3608363",
        "y": "0.06951889",
        "z": "1.9987"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.03392624",
        "y": "-0.01943041",
        "z": "2.296498"
      },
      "SpineMid": {
        "x": "0.04161327",
        "y": "0.2923869",
        "z": "2.253258"
      },
      "Neck": {
        "x": "0.05006999",
        "y": "0.5933986",
        "z": "2.197603"
      },
      "Head": {
        "x": "0.03861278",
        "y": "0.7497788",
        "z": "2.183084"
      },
      "ShoulderLeft": {
        "x": "-0.1248511",
        "y": "0.4545833",
        "z": "2.214545"
      },
      "ElbowLeft": {
        "x": "-0.2196847",
        "y": "0.2648875",
        "z": "2.266232"
      },
      "WristLeft": {
        "x": "-0.313245",
        "y": "0.1322835",
        "z": "2.121544"
      },
      "HandLeft": {
        "x": "-0.3458784",
        "y": "0.09001769",
        "z": "2.07983"
      },
      "ShoulderRight": {
        "x": "0.210377",
        "y": "0.460961",
        "z": "2.188343"
      },
      "ElbowRight": {
        "x": "0.3177666",
        "y": "0.2829607",
        "z": "2.192348"
      },
      "WristRight": {
        "x": "0.3671756",
        "y": "0.1862612",
        "z": "2.002054"
      },
      "HandRight": {
        "x": "0.3822118",
        "y": "0.1528707",
        "z": "1.943114"
      },
      "HipLeft": {
        "x": "-0.04224417",
        "y": "-0.01755207",
        "z": "2.265483"
      },
      "KneeLeft": {
        "x": "-0.09907329",
        "y": "-0.3179791",
        "z": "2.248942"
      },
      "AnkleLeft": {
        "x": "-0.07951495",
        "y": "-0.6171774",
        "z": "2.325748"
      },
      "FootLeft": {
        "x": "-0.09156159",
        "y": "-0.703826",
        "z": "2.259135"
      },
      "HipRight": {
        "x": "0.1090333",
        "y": "-0.02063842",
        "z": "2.254229"
      },
      "KneeRight": {
        "x": "0.1505008",
        "y": "-0.3149652",
        "z": "2.288847"
      },
      "AnkleRight": {
        "x": "0.1628077",
        "y": "-0.61552",
        "z": "2.400499"
      },
      "FootRight": {
        "x": "0.1567875",
        "y": "-0.6807637",
        "z": "2.348234"
      },
      "SpineShoulder": {
        "x": "0.04792429",
        "y": "0.5196996",
        "z": "2.213735"
      },
      "HandTipLeft": {
        "x": "-0.3880818",
        "y": "0.06233458",
        "z": "2.02829"
      },
      "ThumbLeft": {
        "x": "-0.3278041",
        "y": "0.1226337",
        "z": "2.0205"
      },
      "HandTipRight": {
        "x": "0.4272368",
        "y": "0.150254",
        "z": "1.840772"
      },
      "ThumbRight": {
        "x": "0.4142494",
        "y": "0.1237356",
        "z": "1.912625"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.03766574",
        "y": "-0.01878538",
        "z": "2.300534"
      },
      "SpineMid": {
        "x": "0.046863",
        "y": "0.2929879",
        "z": "2.258748"
      },
      "Neck": {
        "x": "0.05622155",
        "y": "0.5938813",
        "z": "2.204473"
      },
      "Head": {
        "x": "0.04387224",
        "y": "0.7506647",
        "z": "2.187757"
      },
      "ShoulderLeft": {
        "x": "-0.1209646",
        "y": "0.4564023",
        "z": "2.22175"
      },
      "ElbowLeft": {
        "x": "-0.2176736",
        "y": "0.270586",
        "z": "2.269713"
      },
      "WristLeft": {
        "x": "-0.3044074",
        "y": "0.1462803",
        "z": "2.135814"
      },
      "HandLeft": {
        "x": "-0.3504321",
        "y": "0.1275515",
        "z": "2.065624"
      },
      "ShoulderRight": {
        "x": "0.215607",
        "y": "0.4598995",
        "z": "2.195065"
      },
      "ElbowRight": {
        "x": "0.327272",
        "y": "0.2744371",
        "z": "2.19899"
      },
      "WristRight": {
        "x": "0.3791876",
        "y": "0.1628833",
        "z": "1.963037"
      },
      "HandRight": {
        "x": "0.3964797",
        "y": "0.1859716",
        "z": "1.932277"
      },
      "HipLeft": {
        "x": "-0.03920566",
        "y": "-0.01679517",
        "z": "2.26929"
      },
      "KneeLeft": {
        "x": "-0.09854293",
        "y": "-0.3166375",
        "z": "2.250995"
      },
      "AnkleLeft": {
        "x": "-0.08028729",
        "y": "-0.6200649",
        "z": "2.327795"
      },
      "FootLeft": {
        "x": "-0.1110139",
        "y": "-0.7047674",
        "z": "2.269124"
      },
      "HipRight": {
        "x": "0.1134007",
        "y": "-0.02016111",
        "z": "2.258427"
      },
      "KneeRight": {
        "x": "0.1533862",
        "y": "-0.3132108",
        "z": "2.296026"
      },
      "AnkleRight": {
        "x": "0.1634413",
        "y": "-0.6140247",
        "z": "2.402004"
      },
      "FootRight": {
        "x": "0.157538",
        "y": "-0.6816741",
        "z": "2.349146"
      },
      "SpineShoulder": {
        "x": "0.05391362",
        "y": "0.5202144",
        "z": "2.220255"
      },
      "HandTipLeft": {
        "x": "-0.3966761",
        "y": "0.1071503",
        "z": "2.016717"
      },
      "ThumbLeft": {
        "x": "-0.3339051",
        "y": "0.1537634",
        "z": "2.019526"
      },
      "HandTipRight": {
        "x": "0.43872",
        "y": "0.1726512",
        "z": "1.83937"
      },
      "ThumbRight": {
        "x": "0.42457",
        "y": "0.1530326",
        "z": "1.906364"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.04063849",
        "y": "-0.01851467",
        "z": "2.303099"
      },
      "SpineMid": {
        "x": "0.04969336",
        "y": "0.2935144",
        "z": "2.262029"
      },
      "Neck": {
        "x": "0.05863769",
        "y": "0.5946923",
        "z": "2.208525"
      },
      "Head": {
        "x": "0.04896395",
        "y": "0.751011",
        "z": "2.193495"
      },
      "ShoulderLeft": {
        "x": "-0.1172876",
        "y": "0.4574497",
        "z": "2.225904"
      },
      "ElbowLeft": {
        "x": "-0.2090108",
        "y": "0.2700393",
        "z": "2.292458"
      },
      "WristLeft": {
        "x": "-0.2973405",
        "y": "0.1754421",
        "z": "2.135942"
      },
      "HandLeft": {
        "x": "-0.3521679",
        "y": "0.1681535",
        "z": "2.047943"
      },
      "ShoulderRight": {
        "x": "0.2192974",
        "y": "0.4596105",
        "z": "2.200732"
      },
      "ElbowRight": {
        "x": "0.3326057",
        "y": "0.2688171",
        "z": "2.204444"
      },
      "WristRight": {
        "x": "0.3888226",
        "y": "0.2326462",
        "z": "1.995125"
      },
      "HandRight": {
        "x": "0.409044",
        "y": "0.2221322",
        "z": "1.923924"
      },
      "HipLeft": {
        "x": "-0.0365553",
        "y": "-0.01638077",
        "z": "2.271806"
      },
      "KneeLeft": {
        "x": "-0.09754182",
        "y": "-0.3147539",
        "z": "2.252655"
      },
      "AnkleLeft": {
        "x": "-0.082348",
        "y": "-0.6212662",
        "z": "2.329647"
      },
      "FootLeft": {
        "x": "-0.1184543",
        "y": "-0.7053339",
        "z": "2.276253"
      },
      "HipRight": {
        "x": "0.1165883",
        "y": "-0.02005674",
        "z": "2.260985"
      },
      "KneeRight": {
        "x": "0.1560448",
        "y": "-0.3120721",
        "z": "2.299213"
      },
      "AnkleRight": {
        "x": "0.1639088",
        "y": "-0.6160262",
        "z": "2.403236"
      },
      "FootRight": {
        "x": "0.1577117",
        "y": "-0.6818151",
        "z": "2.349576"
      },
      "SpineShoulder": {
        "x": "0.05645296",
        "y": "0.5209498",
        "z": "2.224099"
      },
      "HandTipLeft": {
        "x": "-0.3945963",
        "y": "0.1781893",
        "z": "1.974609"
      },
      "ThumbLeft": {
        "x": "-0.3169873",
        "y": "0.1991333",
        "z": "2.005833"
      },
      "HandTipRight": {
        "x": "0.4497791",
        "y": "0.2446548",
        "z": "1.82312"
      },
      "ThumbRight": {
        "x": "0.4454621",
        "y": "0.1935289",
        "z": "1.885036"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.0426016",
        "y": "-0.01839846",
        "z": "2.304303"
      },
      "SpineMid": {
        "x": "0.05203401",
        "y": "0.2937079",
        "z": "2.265599"
      },
      "Neck": {
        "x": "0.06115029",
        "y": "0.5949931",
        "z": "2.216023"
      },
      "Head": {
        "x": "0.05258939",
        "y": "0.751651",
        "z": "2.199406"
      },
      "ShoulderLeft": {
        "x": "-0.1155424",
        "y": "0.4579279",
        "z": "2.23023"
      },
      "ElbowLeft": {
        "x": "-0.2166234",
        "y": "0.2586809",
        "z": "2.290454"
      },
      "WristLeft": {
        "x": "-0.3167646",
        "y": "0.200848",
        "z": "2.093658"
      },
      "HandLeft": {
        "x": "-0.3548506",
        "y": "0.2066733",
        "z": "2.035418"
      },
      "ShoulderRight": {
        "x": "0.2224704",
        "y": "0.459512",
        "z": "2.206341"
      },
      "ElbowRight": {
        "x": "0.3369263",
        "y": "0.2672278",
        "z": "2.212891"
      },
      "WristRight": {
        "x": "0.4027852",
        "y": "0.2340665",
        "z": "1.961257"
      },
      "HandRight": {
        "x": "0.4168311",
        "y": "0.2535865",
        "z": "1.930687"
      },
      "HipLeft": {
        "x": "-0.03470753",
        "y": "-0.01631112",
        "z": "2.273052"
      },
      "KneeLeft": {
        "x": "-0.09637237",
        "y": "-0.314349",
        "z": "2.253636"
      },
      "AnkleLeft": {
        "x": "-0.09450918",
        "y": "-0.6216497",
        "z": "2.339324"
      },
      "FootLeft": {
        "x": "-0.135515",
        "y": "-0.7040727",
        "z": "2.287311"
      },
      "HipRight": {
        "x": "0.1185902",
        "y": "-0.01989783",
        "z": "2.262108"
      },
      "KneeRight": {
        "x": "0.1582884",
        "y": "-0.3104672",
        "z": "2.300651"
      },
      "AnkleRight": {
        "x": "0.1640332",
        "y": "-0.6153873",
        "z": "2.40422"
      },
      "FootRight": {
        "x": "0.1579396",
        "y": "-0.6819896",
        "z": "2.349963"
      },
      "SpineShoulder": {
        "x": "0.05896213",
        "y": "0.5212187",
        "z": "2.230459"
      },
      "HandTipLeft": {
        "x": "-0.3986813",
        "y": "0.2292076",
        "z": "1.98135"
      },
      "ThumbLeft": {
        "x": "-0.3151039",
        "y": "0.2302965",
        "z": "2.008579"
      },
      "HandTipRight": {
        "x": "0.453481",
        "y": "0.2771043",
        "z": "1.8446"
      },
      "ThumbRight": {
        "x": "0.455138",
        "y": "0.2266031",
        "z": "1.896695"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.04407141",
        "y": "-0.01820864",
        "z": "2.30535"
      },
      "SpineMid": {
        "x": "0.05325223",
        "y": "0.2941968",
        "z": "2.269263"
      },
      "Neck": {
        "x": "0.06141444",
        "y": "0.5959268",
        "z": "2.223467"
      },
      "Head": {
        "x": "0.05441371",
        "y": "0.7516372",
        "z": "2.206031"
      },
      "ShoulderLeft": {
        "x": "-0.1144706",
        "y": "0.4587861",
        "z": "2.233275"
      },
      "ElbowLeft": {
        "x": "-0.2311049",
        "y": "0.2511639",
        "z": "2.308981"
      },
      "WristLeft": {
        "x": "-0.3186766",
        "y": "0.2175527",
        "z": "2.087849"
      },
      "HandLeft": {
        "x": "-0.3583249",
        "y": "0.2457975",
        "z": "2.020784"
      },
      "ShoulderRight": {
        "x": "0.2243554",
        "y": "0.460272",
        "z": "2.213017"
      },
      "ElbowRight": {
        "x": "0.3431471",
        "y": "0.2659191",
        "z": "2.212887"
      },
      "WristRight": {
        "x": "0.3928914",
        "y": "0.240601",
        "z": "1.996409"
      },
      "HandRight": {
        "x": "0.42094",
        "y": "0.2848915",
        "z": "1.937244"
      },
      "HipLeft": {
        "x": "-0.03342536",
        "y": "-0.01614974",
        "z": "2.27369"
      },
      "KneeLeft": {
        "x": "-0.09581418",
        "y": "-0.3142143",
        "z": "2.254619"
      },
      "AnkleLeft": {
        "x": "-0.1094351",
        "y": "-0.6224093",
        "z": "2.349878"
      },
      "FootLeft": {
        "x": "-0.1473978",
        "y": "-0.7067488",
        "z": "2.300305"
      },
      "HipRight": {
        "x": "0.1202235",
        "y": "-0.01968111",
        "z": "2.263624"
      },
      "KneeRight": {
        "x": "0.1605932",
        "y": "-0.3097306",
        "z": "2.300758"
      },
      "AnkleRight": {
        "x": "0.1641029",
        "y": "-0.6155921",
        "z": "2.404523"
      },
      "FootRight": {
        "x": "0.1585946",
        "y": "-0.6833188",
        "z": "2.351012"
      },
      "SpineShoulder": {
        "x": "0.05953915",
        "y": "0.52203",
        "z": "2.236909"
      },
      "HandTipLeft": {
        "x": "-0.395794",
        "y": "0.2773346",
        "z": "1.957896"
      },
      "ThumbLeft": {
        "x": "-0.3194384",
        "y": "0.2768415",
        "z": "1.969"
      },
      "HandTipRight": {
        "x": "0.4481887",
        "y": "0.3317745",
        "z": "1.856462"
      },
      "ThumbRight": {
        "x": "0.4599661",
        "y": "0.260293",
        "z": "1.905353"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.04452076",
        "y": "-0.01820334",
        "z": "2.30576"
      },
      "SpineMid": {
        "x": "0.05365379",
        "y": "0.2944912",
        "z": "2.272657"
      },
      "Neck": {
        "x": "0.06115814",
        "y": "0.5966883",
        "z": "2.231198"
      },
      "Head": {
        "x": "0.05499459",
        "y": "0.7526712",
        "z": "2.213452"
      },
      "ShoulderLeft": {
        "x": "-0.1144622",
        "y": "0.4589667",
        "z": "2.236496"
      },
      "ElbowLeft": {
        "x": "-0.2326411",
        "y": "0.298862",
        "z": "2.259942"
      },
      "WristLeft": {
        "x": "-0.322263",
        "y": "0.2393374",
        "z": "2.086395"
      },
      "HandLeft": {
        "x": "-0.359886",
        "y": "0.2800832",
        "z": "2.014625"
      },
      "ShoulderRight": {
        "x": "0.2249583",
        "y": "0.4624227",
        "z": "2.222083"
      },
      "ElbowRight": {
        "x": "0.3491446",
        "y": "0.2984678",
        "z": "2.219185"
      },
      "WristRight": {
        "x": "0.4046959",
        "y": "0.2789285",
        "z": "2.01675"
      },
      "HandRight": {
        "x": "0.4247378",
        "y": "0.3121219",
        "z": "1.946523"
      },
      "HipLeft": {
        "x": "-0.0330251",
        "y": "-0.016192",
        "z": "2.273824"
      },
      "KneeLeft": {
        "x": "-0.09733132",
        "y": "-0.316543",
        "z": "2.257961"
      },
      "AnkleLeft": {
        "x": "-0.1218121",
        "y": "-0.6200302",
        "z": "2.356729"
      },
      "FootLeft": {
        "x": "-0.150449",
        "y": "-0.7078068",
        "z": "2.306349"
      },
      "HipRight": {
        "x": "0.1207398",
        "y": "-0.0196046",
        "z": "2.264418"
      },
      "KneeRight": {
        "x": "0.1616896",
        "y": "-0.3096318",
        "z": "2.300217"
      },
      "AnkleRight": {
        "x": "0.1641759",
        "y": "-0.6145502",
        "z": "2.404711"
      },
      "FootRight": {
        "x": "0.1592292",
        "y": "-0.684752",
        "z": "2.352304"
      },
      "SpineShoulder": {
        "x": "0.05947101",
        "y": "0.5226644",
        "z": "2.243531"
      },
      "HandTipLeft": {
        "x": "-0.4035554",
        "y": "0.3153003",
        "z": "1.939489"
      },
      "ThumbLeft": {
        "x": "-0.3191945",
        "y": "0.3149185",
        "z": "1.963429"
      },
      "HandTipRight": {
        "x": "0.4601716",
        "y": "0.3621161",
        "z": "1.873022"
      },
      "ThumbRight": {
        "x": "0.4653237",
        "y": "0.2821833",
        "z": "1.929579"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.04448259",
        "y": "-0.01834186",
        "z": "2.305868"
      },
      "SpineMid": {
        "x": "0.05289026",
        "y": "0.2943868",
        "z": "2.275432"
      },
      "Neck": {
        "x": "0.05948661",
        "y": "0.5971067",
        "z": "2.237721"
      },
      "Head": {
        "x": "0.05307681",
        "y": "0.75331",
        "z": "2.222132"
      },
      "ShoulderLeft": {
        "x": "-0.115029",
        "y": "0.4585625",
        "z": "2.239196"
      },
      "ElbowLeft": {
        "x": "-0.2329509",
        "y": "0.299044",
        "z": "2.259549"
      },
      "WristLeft": {
        "x": "-0.3420071",
        "y": "0.2894096",
        "z": "2.048585"
      },
      "HandLeft": {
        "x": "-0.3617462",
        "y": "0.315874",
        "z": "2.008264"
      },
      "ShoulderRight": {
        "x": "0.224126",
        "y": "0.4628405",
        "z": "2.229945"
      },
      "ElbowRight": {
        "x": "0.3480198",
        "y": "0.2989726",
        "z": "2.232923"
      },
      "WristRight": {
        "x": "0.4028094",
        "y": "0.2847206",
        "z": "2.01473"
      },
      "HandRight": {
        "x": "0.4263008",
        "y": "0.3369908",
        "z": "1.956135"
      },
      "HipLeft": {
        "x": "-0.03303042",
        "y": "-0.01641832",
        "z": "2.273729"
      },
      "KneeLeft": {
        "x": "-0.09897111",
        "y": "-0.3175445",
        "z": "2.259816"
      },
      "AnkleLeft": {
        "x": "-0.1294018",
        "y": "-0.6220971",
        "z": "2.36524"
      },
      "FootLeft": {
        "x": "-0.1509586",
        "y": "-0.7052414",
        "z": "2.314051"
      },
      "HipRight": {
        "x": "0.1206148",
        "y": "-0.01976618",
        "z": "2.264792"
      },
      "KneeRight": {
        "x": "0.1628469",
        "y": "-0.3091045",
        "z": "2.298914"
      },
      "AnkleRight": {
        "x": "0.1640541",
        "y": "-0.6151012",
        "z": "2.405364"
      },
      "FootRight": {
        "x": "0.1593352",
        "y": "-0.6849372",
        "z": "2.352564"
      },
      "SpineShoulder": {
        "x": "0.05800079",
        "y": "0.5229251",
        "z": "2.249125"
      },
      "HandTipLeft": {
        "x": "-0.3999939",
        "y": "0.3539021",
        "z": "1.941958"
      },
      "ThumbLeft": {
        "x": "-0.3155505",
        "y": "0.3458751",
        "z": "1.973562"
      },
      "HandTipRight": {
        "x": "0.4582146",
        "y": "0.3873284",
        "z": "1.890343"
      },
      "ThumbRight": {
        "x": "0.4691637",
        "y": "0.3166971",
        "z": "1.927083"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.04269975",
        "y": "-0.01978157",
        "z": "2.304459"
      },
      "SpineMid": {
        "x": "0.04706411",
        "y": "0.2928892",
        "z": "2.279145"
      },
      "Neck": {
        "x": "0.04609074",
        "y": "0.5953901",
        "z": "2.250476"
      },
      "Head": {
        "x": "0.04776578",
        "y": "0.7534261",
        "z": "2.231865"
      },
      "ShoulderLeft": {
        "x": "-0.121384",
        "y": "0.4570103",
        "z": "2.244323"
      },
      "ElbowLeft": {
        "x": "-0.245825",
        "y": "0.2955059",
        "z": "2.257744"
      },
      "WristLeft": {
        "x": "-0.3427552",
        "y": "0.343743",
        "z": "2.036776"
      },
      "HandLeft": {
        "x": "-0.356381",
        "y": "0.3743423",
        "z": "2.010548"
      },
      "ShoulderRight": {
        "x": "0.2172448",
        "y": "0.4608703",
        "z": "2.24271"
      },
      "ElbowRight": {
        "x": "0.3444321",
        "y": "0.303159",
        "z": "2.244458"
      },
      "WristRight": {
        "x": "0.4148964",
        "y": "0.3526619",
        "z": "2.00632"
      },
      "HandRight": {
        "x": "0.4266029",
        "y": "0.3837281",
        "z": "1.973603"
      },
      "HipLeft": {
        "x": "-0.03513275",
        "y": "-0.01904898",
        "z": "2.270083"
      },
      "KneeLeft": {
        "x": "-0.1018876",
        "y": "-0.3203326",
        "z": "2.260465"
      },
      "AnkleLeft": {
        "x": "-0.1334719",
        "y": "-0.6220249",
        "z": "2.368151"
      },
      "FootLeft": {
        "x": "-0.1511131",
        "y": "-0.7038158",
        "z": "2.316458"
      },
      "HipRight": {
        "x": "0.1190076",
        "y": "-0.02048872",
        "z": "2.264581"
      },
      "KneeRight": {
        "x": "0.1633339",
        "y": "-0.3071004",
        "z": "2.286128"
      },
      "AnkleRight": {
        "x": "0.1636435",
        "y": "-0.6166471",
        "z": "2.405088"
      },
      "FootRight": {
        "x": "0.159153",
        "y": "-0.684871",
        "z": "2.352335"
      },
      "SpineShoulder": {
        "x": "0.04666569",
        "y": "0.5212263",
        "z": "2.259296"
      },
      "HandTipLeft": {
        "x": "-0.3882736",
        "y": "0.4281381",
        "z": "1.950515"
      },
      "ThumbLeft": {
        "x": "-0.3080058",
        "y": "0.3943025",
        "z": "1.98875"
      },
      "HandTipRight": {
        "x": "0.4537032",
        "y": "0.4426285",
        "z": "1.900687"
      },
      "ThumbRight": {
        "x": "0.4791178",
        "y": "0.3677769",
        "z": "1.943"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.03902137",
        "y": "-0.02140057",
        "z": "2.302497"
      },
      "SpineMid": {
        "x": "0.04102855",
        "y": "0.2915958",
        "z": "2.281417"
      },
      "Neck": {
        "x": "0.03989806",
        "y": "0.5943907",
        "z": "2.254418"
      },
      "Head": {
        "x": "0.04396687",
        "y": "0.7525177",
        "z": "2.236344"
      },
      "ShoulderLeft": {
        "x": "-0.1269921",
        "y": "0.45606",
        "z": "2.246248"
      },
      "ElbowLeft": {
        "x": "-0.2564308",
        "y": "0.2962569",
        "z": "2.256055"
      },
      "WristLeft": {
        "x": "-0.3416026",
        "y": "0.3529792",
        "z": "2.042191"
      },
      "HandLeft": {
        "x": "-0.3531659",
        "y": "0.4027032",
        "z": "2.019793"
      },
      "ShoulderRight": {
        "x": "0.2129587",
        "y": "0.4600104",
        "z": "2.247282"
      },
      "ElbowRight": {
        "x": "0.3425829",
        "y": "0.3062326",
        "z": "2.253016"
      },
      "WristRight": {
        "x": "0.4133897",
        "y": "0.365346",
        "z": "2.014329"
      },
      "HandRight": {
        "x": "0.4231958",
        "y": "0.4051622",
        "z": "1.987844"
      },
      "HipLeft": {
        "x": "-0.03828805",
        "y": "-0.02129624",
        "z": "2.26741"
      },
      "KneeLeft": {
        "x": "-0.1037501",
        "y": "-0.3231281",
        "z": "2.259884"
      },
      "AnkleLeft": {
        "x": "-0.1352834",
        "y": "-0.6240687",
        "z": "2.370334"
      },
      "FootLeft": {
        "x": "-0.1512522",
        "y": "-0.7025654",
        "z": "2.318637"
      },
      "HipRight": {
        "x": "0.1149229",
        "y": "-0.02131139",
        "z": "2.263428"
      },
      "KneeRight": {
        "x": "0.1623737",
        "y": "-0.308825",
        "z": "2.276186"
      },
      "AnkleRight": {
        "x": "0.1634059",
        "y": "-0.617803",
        "z": "2.403747"
      },
      "FootRight": {
        "x": "0.1588968",
        "y": "-0.6849696",
        "z": "2.352104"
      },
      "SpineShoulder": {
        "x": "0.04025286",
        "y": "0.5201537",
        "z": "2.263094"
      },
      "HandTipLeft": {
        "x": "-0.3758199",
        "y": "0.4667481",
        "z": "1.97013"
      },
      "ThumbLeft": {
        "x": "-0.3034708",
        "y": "0.4200951",
        "z": "2.00244"
      },
      "HandTipRight": {
        "x": "0.4630257",
        "y": "0.4604242",
        "z": "1.922119"
      },
      "ThumbRight": {
        "x": "0.4658619",
        "y": "0.3914049",
        "z": "1.955523"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.03447357",
        "y": "-0.02382888",
        "z": "2.299633"
      },
      "SpineMid": {
        "x": "0.03520427",
        "y": "0.2902349",
        "z": "2.282512"
      },
      "Neck": {
        "x": "0.03320019",
        "y": "0.5937629",
        "z": "2.257599"
      },
      "Head": {
        "x": "0.03735872",
        "y": "0.7520675",
        "z": "2.241886"
      },
      "ShoulderLeft": {
        "x": "-0.1343999",
        "y": "0.4552448",
        "z": "2.248431"
      },
      "ElbowLeft": {
        "x": "-0.2762528",
        "y": "0.3004192",
        "z": "2.258478"
      },
      "WristLeft": {
        "x": "-0.3436965",
        "y": "0.4029545",
        "z": "2.052303"
      },
      "HandLeft": {
        "x": "-0.3535634",
        "y": "0.4458101",
        "z": "2.026813"
      },
      "ShoulderRight": {
        "x": "0.2073377",
        "y": "0.459072",
        "z": "2.252946"
      },
      "ElbowRight": {
        "x": "0.3561293",
        "y": "0.2913389",
        "z": "2.268858"
      },
      "WristRight": {
        "x": "0.4131269",
        "y": "0.399148",
        "z": "2.031942"
      },
      "HandRight": {
        "x": "0.4223864",
        "y": "0.4392318",
        "z": "2.000756"
      },
      "HipLeft": {
        "x": "-0.04215479",
        "y": "-0.02427557",
        "z": "2.263626"
      },
      "KneeLeft": {
        "x": "-0.1053654",
        "y": "-0.326311",
        "z": "2.258326"
      },
      "AnkleLeft": {
        "x": "-0.1362431",
        "y": "-0.6258786",
        "z": "2.372224"
      },
      "FootLeft": {
        "x": "-0.1515447",
        "y": "-0.7014048",
        "z": "2.320715"
      },
      "HipRight": {
        "x": "0.1098648",
        "y": "-0.02300568",
        "z": "2.261586"
      },
      "KneeRight": {
        "x": "0.1609755",
        "y": "-0.3117478",
        "z": "2.267672"
      },
      "AnkleRight": {
        "x": "0.1631573",
        "y": "-0.6174793",
        "z": "2.402984"
      },
      "FootRight": {
        "x": "0.1583171",
        "y": "-0.6846565",
        "z": "2.351512"
      },
      "SpineShoulder": {
        "x": "0.03376043",
        "y": "0.5193557",
        "z": "2.265818"
      },
      "HandTipLeft": {
        "x": "-0.3649896",
        "y": "0.5116957",
        "z": "1.976316"
      },
      "ThumbLeft": {
        "x": "-0.3000252",
        "y": "0.4513834",
        "z": "2.008263"
      },
      "HandTipRight": {
        "x": "0.4453488",
        "y": "0.4981851",
        "z": "1.927779"
      },
      "ThumbRight": {
        "x": "0.4694566",
        "y": "0.4270042",
        "z": "1.964281"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.03042414",
        "y": "-0.0225671",
        "z": "2.296836"
      },
      "SpineMid": {
        "x": "0.02751547",
        "y": "0.2917078",
        "z": "2.284215"
      },
      "Neck": {
        "x": "0.02080805",
        "y": "0.5953138",
        "z": "2.264447"
      },
      "Head": {
        "x": "0.02687187",
        "y": "0.752715",
        "z": "2.250526"
      },
      "ShoulderLeft": {
        "x": "-0.1506797",
        "y": "0.4575909",
        "z": "2.2563"
      },
      "ElbowLeft": {
        "x": "-0.3340461",
        "y": "0.3620692",
        "z": "2.255741"
      },
      "WristLeft": {
        "x": "-0.3668211",
        "y": "0.5055515",
        "z": "2.071576"
      },
      "HandLeft": {
        "x": "-0.3661601",
        "y": "0.5609964",
        "z": "2.047157"
      },
      "ShoulderRight": {
        "x": "0.2010917",
        "y": "0.4642155",
        "z": "2.261891"
      },
      "ElbowRight": {
        "x": "0.3758571",
        "y": "0.3773341",
        "z": "2.262462"
      },
      "WristRight": {
        "x": "0.4211379",
        "y": "0.5006258",
        "z": "2.057799"
      },
      "HandRight": {
        "x": "0.4235473",
        "y": "0.5496985",
        "z": "2.024121"
      },
      "HipLeft": {
        "x": "-0.04572956",
        "y": "-0.02367781",
        "z": "2.260443"
      },
      "KneeLeft": {
        "x": "-0.1068907",
        "y": "-0.3273638",
        "z": "2.255095"
      },
      "AnkleLeft": {
        "x": "-0.137154",
        "y": "-0.6256473",
        "z": "2.372853"
      },
      "FootLeft": {
        "x": "-0.151367",
        "y": "-0.7002715",
        "z": "2.321655"
      },
      "HipRight": {
        "x": "0.1054287",
        "y": "-0.02094083",
        "z": "2.259297"
      },
      "KneeRight": {
        "x": "0.1565073",
        "y": "-0.310757",
        "z": "2.259254"
      },
      "AnkleRight": {
        "x": "0.1622003",
        "y": "-0.6169358",
        "z": "2.401128"
      },
      "FootRight": {
        "x": "0.1580317",
        "y": "-0.6843737",
        "z": "2.351333"
      },
      "SpineShoulder": {
        "x": "0.02262569",
        "y": "0.5209357",
        "z": "2.271257"
      },
      "HandTipLeft": {
        "x": "-0.3599081",
        "y": "0.630297",
        "z": "2.009649"
      },
      "ThumbLeft": {
        "x": "-0.3096156",
        "y": "0.5476611",
        "z": "2.045067"
      },
      "HandTipRight": {
        "x": "0.4307926",
        "y": "0.6157516",
        "z": "1.969506"
      },
      "ThumbRight": {
        "x": "0.4647009",
        "y": "0.5312828",
        "z": "1.99086"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.02599429",
        "y": "-0.01996595",
        "z": "2.29396"
      },
      "SpineMid": {
        "x": "0.02261572",
        "y": "0.2932819",
        "z": "2.284678"
      },
      "Neck": {
        "x": "0.01652676",
        "y": "0.595891",
        "z": "2.266321"
      },
      "Head": {
        "x": "0.02134755",
        "y": "0.7532203",
        "z": "2.255071"
      },
      "ShoulderLeft": {
        "x": "-0.1588295",
        "y": "0.4613526",
        "z": "2.260341"
      },
      "ElbowLeft": {
        "x": "-0.3445025",
        "y": "0.3886141",
        "z": "2.26009"
      },
      "WristLeft": {
        "x": "-0.3830745",
        "y": "0.577078",
        "z": "2.071373"
      },
      "HandLeft": {
        "x": "-0.374303",
        "y": "0.6301031",
        "z": "2.050858"
      },
      "ShoulderRight": {
        "x": "0.2010246",
        "y": "0.4678571",
        "z": "2.268592"
      },
      "ElbowRight": {
        "x": "0.3897092",
        "y": "0.4182693",
        "z": "2.258149"
      },
      "WristRight": {
        "x": "0.4262894",
        "y": "0.5756264",
        "z": "2.053693"
      },
      "HandRight": {
        "x": "0.4261817",
        "y": "0.6190321",
        "z": "2.030776"
      },
      "HipLeft": {
        "x": "-0.04998359",
        "y": "-0.02117755",
        "z": "2.256758"
      },
      "KneeLeft": {
        "x": "-0.1082435",
        "y": "-0.3254833",
        "z": "2.25142"
      },
      "AnkleLeft": {
        "x": "-0.1380443",
        "y": "-0.6248082",
        "z": "2.373841"
      },
      "FootLeft": {
        "x": "-0.1514306",
        "y": "-0.7000093",
        "z": "2.322125"
      },
      "HipRight": {
        "x": "0.101005",
        "y": "-0.01824459",
        "z": "2.25725"
      },
      "KneeRight": {
        "x": "0.154309",
        "y": "-0.3101868",
        "z": "2.25704"
      },
      "AnkleRight": {
        "x": "0.1614094",
        "y": "-0.6158516",
        "z": "2.40022"
      },
      "FootRight": {
        "x": "0.157536",
        "y": "-0.6841676",
        "z": "2.350902"
      },
      "SpineShoulder": {
        "x": "0.0181333",
        "y": "0.5217603",
        "z": "2.272897"
      },
      "HandTipLeft": {
        "x": "-0.3623658",
        "y": "0.6988642",
        "z": "2.022482"
      },
      "ThumbLeft": {
        "x": "-0.3198769",
        "y": "0.6056932",
        "z": "2.03563"
      },
      "HandTipRight": {
        "x": "0.4274226",
        "y": "0.6829342",
        "z": "1.979143"
      },
      "ThumbRight": {
        "x": "0.4768412",
        "y": "0.616232",
        "z": "2.002677"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.02215186",
        "y": "-0.01576059",
        "z": "2.292419"
      },
      "SpineMid": {
        "x": "0.01765937",
        "y": "0.2961512",
        "z": "2.285505"
      },
      "Neck": {
        "x": "0.01134015",
        "y": "0.5973411",
        "z": "2.268419"
      },
      "Head": {
        "x": "0.01754251",
        "y": "0.7542055",
        "z": "2.258425"
      },
      "ShoulderLeft": {
        "x": "-0.1689665",
        "y": "0.4674042",
        "z": "2.261858"
      },
      "ElbowLeft": {
        "x": "-0.3808543",
        "y": "0.4582153",
        "z": "2.257355"
      },
      "WristLeft": {
        "x": "-0.3951216",
        "y": "0.6341749",
        "z": "2.082576"
      },
      "HandLeft": {
        "x": "-0.3826561",
        "y": "0.7007532",
        "z": "2.052923"
      },
      "ShoulderRight": {
        "x": "0.2025682",
        "y": "0.4735346",
        "z": "2.271665"
      },
      "ElbowRight": {
        "x": "0.3967731",
        "y": "0.4741178",
        "z": "2.251384"
      },
      "WristRight": {
        "x": "0.4319176",
        "y": "0.6486169",
        "z": "2.055434"
      },
      "HandRight": {
        "x": "0.4310919",
        "y": "0.6825691",
        "z": "2.043357"
      },
      "HipLeft": {
        "x": "-0.05337483",
        "y": "-0.01709037",
        "z": "2.254463"
      },
      "KneeLeft": {
        "x": "-0.108458",
        "y": "-0.323435",
        "z": "2.248579"
      },
      "AnkleLeft": {
        "x": "-0.1391504",
        "y": "-0.6233229",
        "z": "2.375812"
      },
      "FootLeft": {
        "x": "-0.1513355",
        "y": "-0.6989473",
        "z": "2.323159"
      },
      "HipRight": {
        "x": "0.09679439",
        "y": "-0.01392892",
        "z": "2.256519"
      },
      "KneeRight": {
        "x": "0.1523799",
        "y": "-0.309315",
        "z": "2.256485"
      },
      "AnkleRight": {
        "x": "0.1609687",
        "y": "-0.6143926",
        "z": "2.39902"
      },
      "FootRight": {
        "x": "0.1569989",
        "y": "-0.6837212",
        "z": "2.350488"
      },
      "SpineShoulder": {
        "x": "0.0129767",
        "y": "0.5235664",
        "z": "2.274745"
      },
      "HandTipLeft": {
        "x": "-0.3642361",
        "y": "0.7675378",
        "z": "2.023361"
      },
      "ThumbLeft": {
        "x": "-0.3259759",
        "y": "0.669625",
        "z": "2.0265"
      },
      "HandTipRight": {
        "x": "0.4350847",
        "y": "0.7516558",
        "z": "2.0059"
      },
      "ThumbRight": {
        "x": "0.4834208",
        "y": "0.6698181",
        "z": "2.027034"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01904074",
        "y": "-0.01060919",
        "z": "2.291658"
      },
      "SpineMid": {
        "x": "0.01481072",
        "y": "0.2990344",
        "z": "2.286641"
      },
      "Neck": {
        "x": "0.009073447",
        "y": "0.5985737",
        "z": "2.270467"
      },
      "Head": {
        "x": "0.01406748",
        "y": "0.7555847",
        "z": "2.261942"
      },
      "ShoulderLeft": {
        "x": "-0.1769556",
        "y": "0.4751008",
        "z": "2.260764"
      },
      "ElbowLeft": {
        "x": "-0.3987267",
        "y": "0.5187415",
        "z": "2.233663"
      },
      "WristLeft": {
        "x": "-0.402074",
        "y": "0.6928828",
        "z": "2.080209"
      },
      "HandLeft": {
        "x": "-0.3903696",
        "y": "0.7614398",
        "z": "2.056461"
      },
      "ShoulderRight": {
        "x": "0.2051793",
        "y": "0.4818307",
        "z": "2.273916"
      },
      "ElbowRight": {
        "x": "0.4143267",
        "y": "0.5251609",
        "z": "2.237513"
      },
      "WristRight": {
        "x": "0.4369852",
        "y": "0.6809959",
        "z": "2.073951"
      },
      "HandRight": {
        "x": "0.4323815",
        "y": "0.7392037",
        "z": "2.053794"
      },
      "HipLeft": {
        "x": "-0.05611524",
        "y": "-0.01199576",
        "z": "2.253177"
      },
      "KneeLeft": {
        "x": "-0.1097259",
        "y": "-0.312371",
        "z": "2.243778"
      },
      "AnkleLeft": {
        "x": "-0.1396403",
        "y": "-0.6225807",
        "z": "2.376905"
      },
      "FootLeft": {
        "x": "-0.1513479",
        "y": "-0.6987334",
        "z": "2.323401"
      },
      "HipRight": {
        "x": "0.09344807",
        "y": "-0.008857697",
        "z": "2.256341"
      },
      "KneeRight": {
        "x": "0.1490564",
        "y": "-0.3054131",
        "z": "2.256434"
      },
      "AnkleRight": {
        "x": "0.1600416",
        "y": "-0.6138856",
        "z": "2.398875"
      },
      "FootRight": {
        "x": "0.1566947",
        "y": "-0.6834404",
        "z": "2.350407"
      },
      "SpineShoulder": {
        "x": "0.01058051",
        "y": "0.5251617",
        "z": "2.276605"
      },
      "HandTipLeft": {
        "x": "-0.3776818",
        "y": "0.8298222",
        "z": "2.032519"
      },
      "ThumbLeft": {
        "x": "-0.3287662",
        "y": "0.7294617",
        "z": "2.022563"
      },
      "HandTipRight": {
        "x": "0.4345799",
        "y": "0.8159206",
        "z": "2.02388"
      },
      "ThumbRight": {
        "x": "0.4800297",
        "y": "0.7252931",
        "z": "2.033143"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.015744",
        "y": "-0.005194861",
        "z": "2.292482"
      },
      "SpineMid": {
        "x": "0.0123495",
        "y": "0.3021123",
        "z": "2.287696"
      },
      "Neck": {
        "x": "0.007863221",
        "y": "0.5996181",
        "z": "2.271209"
      },
      "Head": {
        "x": "0.01049408",
        "y": "0.7571071",
        "z": "2.265659"
      },
      "ShoulderLeft": {
        "x": "-0.1828886",
        "y": "0.4816721",
        "z": "2.26022"
      },
      "ElbowLeft": {
        "x": "-0.4103529",
        "y": "0.5856518",
        "z": "2.225576"
      },
      "WristLeft": {
        "x": "-0.4178956",
        "y": "0.76102",
        "z": "2.084636"
      },
      "HandLeft": {
        "x": "-0.4036362",
        "y": "0.8333431",
        "z": "2.067674"
      },
      "ShoulderRight": {
        "x": "0.2049592",
        "y": "0.4979483",
        "z": "2.273417"
      },
      "ElbowRight": {
        "x": "0.4230214",
        "y": "0.5359343",
        "z": "2.240341"
      },
      "WristRight": {
        "x": "0.4428136",
        "y": "0.7442897",
        "z": "2.096909"
      },
      "HandRight": {
        "x": "0.4382301",
        "y": "0.8178185",
        "z": "2.080206"
      },
      "HipLeft": {
        "x": "-0.05908059",
        "y": "-0.006392118",
        "z": "2.2546"
      },
      "KneeLeft": {
        "x": "-0.1112989",
        "y": "-0.3101085",
        "z": "2.24443"
      },
      "AnkleLeft": {
        "x": "-0.1402019",
        "y": "-0.6141099",
        "z": "2.380049"
      },
      "FootLeft": {
        "x": "-0.1512786",
        "y": "-0.6969774",
        "z": "2.324345"
      },
      "HipRight": {
        "x": "0.08995679",
        "y": "-0.003769506",
        "z": "2.256634"
      },
      "KneeRight": {
        "x": "0.146189",
        "y": "-0.3030165",
        "z": "2.258685"
      },
      "AnkleRight": {
        "x": "0.1595461",
        "y": "-0.6128954",
        "z": "2.39844"
      },
      "FootRight": {
        "x": "0.1561403",
        "y": "-0.6829623",
        "z": "2.350057"
      },
      "SpineShoulder": {
        "x": "0.009071898",
        "y": "0.5266366",
        "z": "2.277457"
      },
      "HandTipLeft": {
        "x": "-0.3901967",
        "y": "0.9091119",
        "z": "2.051456"
      },
      "ThumbLeft": {
        "x": "-0.3435393",
        "y": "0.8043035",
        "z": "2.029833"
      },
      "HandTipRight": {
        "x": "0.4418321",
        "y": "0.8973498",
        "z": "2.065204"
      },
      "ThumbRight": {
        "x": "0.4824733",
        "y": "0.8238722",
        "z": "2.064355"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01462259",
        "y": "-0.003406149",
        "z": "2.292805"
      },
      "SpineMid": {
        "x": "0.01113349",
        "y": "0.3035947",
        "z": "2.288654"
      },
      "Neck": {
        "x": "0.006843782",
        "y": "0.6005124",
        "z": "2.272618"
      },
      "Head": {
        "x": "0.008544611",
        "y": "0.7575189",
        "z": "2.26843"
      },
      "ShoulderLeft": {
        "x": "-0.183826",
        "y": "0.4838893",
        "z": "2.260052"
      },
      "ElbowLeft": {
        "x": "-0.4103498",
        "y": "0.5856457",
        "z": "2.225574"
      },
      "WristLeft": {
        "x": "-0.4181952",
        "y": "0.7648029",
        "z": "2.086249"
      },
      "HandLeft": {
        "x": "-0.4112273",
        "y": "0.8391744",
        "z": "2.074854"
      },
      "ShoulderRight": {
        "x": "0.2041973",
        "y": "0.5020345",
        "z": "2.273302"
      },
      "ElbowRight": {
        "x": "0.4253258",
        "y": "0.5405936",
        "z": "2.242337"
      },
      "WristRight": {
        "x": "0.4423866",
        "y": "0.7534319",
        "z": "2.10092"
      },
      "HandRight": {
        "x": "0.4383206",
        "y": "0.8287612",
        "z": "2.094063"
      },
      "HipLeft": {
        "x": "-0.0600523",
        "y": "-0.004656983",
        "z": "2.254949"
      },
      "KneeLeft": {
        "x": "-0.1122587",
        "y": "-0.3090996",
        "z": "2.24556"
      },
      "AnkleLeft": {
        "x": "-0.1407181",
        "y": "-0.6124159",
        "z": "2.38089"
      },
      "FootLeft": {
        "x": "-0.1512551",
        "y": "-0.6959871",
        "z": "2.324917"
      },
      "HipRight": {
        "x": "0.08874644",
        "y": "-0.002009324",
        "z": "2.256945"
      },
      "KneeRight": {
        "x": "0.1438444",
        "y": "-0.3020089",
        "z": "2.260521"
      },
      "AnkleRight": {
        "x": "0.1590195",
        "y": "-0.6119509",
        "z": "2.398374"
      },
      "FootRight": {
        "x": "0.1556984",
        "y": "-0.6823922",
        "z": "2.350003"
      },
      "SpineShoulder": {
        "x": "0.007980171",
        "y": "0.5277025",
        "z": "2.278777"
      },
      "HandTipLeft": {
        "x": "-0.4004794",
        "y": "0.9157665",
        "z": "2.056321"
      },
      "ThumbLeft": {
        "x": "-0.3547483",
        "y": "0.8130695",
        "z": "2.046188"
      },
      "HandTipRight": {
        "x": "0.4435012",
        "y": "0.9086155",
        "z": "2.081543"
      },
      "ThumbRight": {
        "x": "0.4794713",
        "y": "0.830789",
        "z": "2.08"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01403843",
        "y": "-0.003413013",
        "z": "2.29332"
      },
      "SpineMid": {
        "x": "0.01043813",
        "y": "0.3038835",
        "z": "2.289856"
      },
      "Neck": {
        "x": "0.006285153",
        "y": "0.6010552",
        "z": "2.274621"
      },
      "Head": {
        "x": "0.007044727",
        "y": "0.7581212",
        "z": "2.27114"
      },
      "ShoulderLeft": {
        "x": "-0.1837626",
        "y": "0.4840982",
        "z": "2.260333"
      },
      "ElbowLeft": {
        "x": "-0.4119376",
        "y": "0.5540138",
        "z": "2.231921"
      },
      "WristLeft": {
        "x": "-0.4225389",
        "y": "0.741003",
        "z": "2.098356"
      },
      "HandLeft": {
        "x": "-0.4241733",
        "y": "0.8069432",
        "z": "2.089935"
      },
      "ShoulderRight": {
        "x": "0.2040642",
        "y": "0.5019037",
        "z": "2.273413"
      },
      "ElbowRight": {
        "x": "0.428481",
        "y": "0.5356241",
        "z": "2.243872"
      },
      "WristRight": {
        "x": "0.4423541",
        "y": "0.729732",
        "z": "2.118251"
      },
      "HandRight": {
        "x": "0.440686",
        "y": "0.7973818",
        "z": "2.11172"
      },
      "HipLeft": {
        "x": "-0.06060788",
        "y": "-0.004691465",
        "z": "2.255495"
      },
      "KneeLeft": {
        "x": "-0.1130115",
        "y": "-0.3096862",
        "z": "2.246746"
      },
      "AnkleLeft": {
        "x": "-0.1411479",
        "y": "-0.613562",
        "z": "2.3823"
      },
      "FootLeft": {
        "x": "-0.1513424",
        "y": "-0.6953745",
        "z": "2.325304"
      },
      "HipRight": {
        "x": "0.08816272",
        "y": "-0.001993217",
        "z": "2.257438"
      },
      "KneeRight": {
        "x": "0.1429961",
        "y": "-0.3027675",
        "z": "2.261466"
      },
      "AnkleRight": {
        "x": "0.1588162",
        "y": "-0.6121017",
        "z": "2.398188"
      },
      "FootRight": {
        "x": "0.155417",
        "y": "-0.6822418",
        "z": "2.349799"
      },
      "SpineShoulder": {
        "x": "0.007360068",
        "y": "0.5281971",
        "z": "2.28058"
      },
      "HandTipLeft": {
        "x": "-0.4257993",
        "y": "0.8843381",
        "z": "2.083174"
      },
      "ThumbLeft": {
        "x": "-0.3722147",
        "y": "0.7791467",
        "z": "2.06887"
      },
      "HandTipRight": {
        "x": "0.4444015",
        "y": "0.877122",
        "z": "2.100739"
      },
      "ThumbRight": {
        "x": "0.4806636",
        "y": "0.7803463",
        "z": "2.086246"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01346393",
        "y": "-0.004172333",
        "z": "2.294003"
      },
      "SpineMid": {
        "x": "0.009867213",
        "y": "0.3036712",
        "z": "2.291068"
      },
      "Neck": {
        "x": "0.005775217",
        "y": "0.6013703",
        "z": "2.276559"
      },
      "Head": {
        "x": "0.006367904",
        "y": "0.7581235",
        "z": "2.272915"
      },
      "ShoulderLeft": {
        "x": "-0.1832332",
        "y": "0.4834631",
        "z": "2.260752"
      },
      "ElbowLeft": {
        "x": "-0.4338693",
        "y": "0.4913548",
        "z": "2.254078"
      },
      "WristLeft": {
        "x": "-0.4291982",
        "y": "0.6967891",
        "z": "2.10574"
      },
      "HandLeft": {
        "x": "-0.4286386",
        "y": "0.7602895",
        "z": "2.093397"
      },
      "ShoulderRight": {
        "x": "0.2035694",
        "y": "0.4999216",
        "z": "2.274159"
      },
      "ElbowRight": {
        "x": "0.4200163",
        "y": "0.5270199",
        "z": "2.246537"
      },
      "WristRight": {
        "x": "0.4431511",
        "y": "0.7158737",
        "z": "2.123312"
      },
      "HandRight": {
        "x": "0.4405051",
        "y": "0.7669623",
        "z": "2.118533"
      },
      "HipLeft": {
        "x": "-0.06114131",
        "y": "-0.005378743",
        "z": "2.256185"
      },
      "KneeLeft": {
        "x": "-0.1144299",
        "y": "-0.3114213",
        "z": "2.248555"
      },
      "AnkleLeft": {
        "x": "-0.1412803",
        "y": "-0.6141639",
        "z": "2.382794"
      },
      "FootLeft": {
        "x": "-0.1512888",
        "y": "-0.6952335",
        "z": "2.325353"
      },
      "HipRight": {
        "x": "0.08757315",
        "y": "-0.002809916",
        "z": "2.258122"
      },
      "KneeRight": {
        "x": "0.1423605",
        "y": "-0.3046864",
        "z": "2.262912"
      },
      "AnkleRight": {
        "x": "0.1591403",
        "y": "-0.6113858",
        "z": "2.397619"
      },
      "FootRight": {
        "x": "0.1551264",
        "y": "-0.6817351",
        "z": "2.349558"
      },
      "SpineShoulder": {
        "x": "0.006821544",
        "y": "0.5283769",
        "z": "2.282326"
      },
      "HandTipLeft": {
        "x": "-0.4277701",
        "y": "0.8443273",
        "z": "2.090337"
      },
      "ThumbLeft": {
        "x": "-0.3744729",
        "y": "0.7340293",
        "z": "2.069364"
      },
      "HandTipRight": {
        "x": "0.4404782",
        "y": "0.8419422",
        "z": "2.106741"
      },
      "ThumbRight": {
        "x": "0.4891051",
        "y": "0.7641886",
        "z": "2.09625"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01294536",
        "y": "-0.009592171",
        "z": "2.295926"
      },
      "SpineMid": {
        "x": "0.009547642",
        "y": "0.3012505",
        "z": "2.293776"
      },
      "Neck": {
        "x": "0.005695526",
        "y": "0.6006033",
        "z": "2.280319"
      },
      "Head": {
        "x": "0.006252806",
        "y": "0.7576875",
        "z": "2.274722"
      },
      "ShoulderLeft": {
        "x": "-0.1784389",
        "y": "0.4740993",
        "z": "2.265824"
      },
      "ElbowLeft": {
        "x": "-0.3630094",
        "y": "0.4064019",
        "z": "2.267321"
      },
      "WristLeft": {
        "x": "-0.4315704",
        "y": "0.6040505",
        "z": "2.120099"
      },
      "HandLeft": {
        "x": "-0.4379181",
        "y": "0.6613745",
        "z": "2.110599"
      },
      "ShoulderRight": {
        "x": "0.1997854",
        "y": "0.4880459",
        "z": "2.27762"
      },
      "ElbowRight": {
        "x": "0.400906",
        "y": "0.4470213",
        "z": "2.269073"
      },
      "WristRight": {
        "x": "0.4453322",
        "y": "0.6390085",
        "z": "2.135621"
      },
      "HandRight": {
        "x": "0.4464287",
        "y": "0.6870845",
        "z": "2.130242"
      },
      "HipLeft": {
        "x": "-0.06187545",
        "y": "-0.01044474",
        "z": "2.258419"
      },
      "KneeLeft": {
        "x": "-0.1153474",
        "y": "-0.3152758",
        "z": "2.249076"
      },
      "AnkleLeft": {
        "x": "-0.141434",
        "y": "-0.6160135",
        "z": "2.382709"
      },
      "FootLeft": {
        "x": "-0.1516568",
        "y": "-0.695459",
        "z": "2.326329"
      },
      "HipRight": {
        "x": "0.0873097",
        "y": "-0.008468038",
        "z": "2.259743"
      },
      "KneeRight": {
        "x": "0.1423648",
        "y": "-0.3075157",
        "z": "2.263191"
      },
      "AnkleRight": {
        "x": "0.1589389",
        "y": "-0.6135557",
        "z": "2.397285"
      },
      "FootRight": {
        "x": "0.1550209",
        "y": "-0.6817567",
        "z": "2.349454"
      },
      "SpineShoulder": {
        "x": "0.006675915",
        "y": "0.5272383",
        "z": "2.285757"
      },
      "HandTipLeft": {
        "x": "-0.4499135",
        "y": "0.7440383",
        "z": "2.110745"
      },
      "ThumbLeft": {
        "x": "-0.3814957",
        "y": "0.649546",
        "z": "2.098428"
      },
      "HandTipRight": {
        "x": "0.4590367",
        "y": "0.7609805",
        "z": "2.122463"
      },
      "ThumbRight": {
        "x": "0.4949057",
        "y": "0.6708239",
        "z": "2.105709"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01271181",
        "y": "-0.01469877",
        "z": "2.297792"
      },
      "SpineMid": {
        "x": "0.009472548",
        "y": "0.2986384",
        "z": "2.296274"
      },
      "Neck": {
        "x": "0.005855286",
        "y": "0.5997428",
        "z": "2.283227"
      },
      "Head": {
        "x": "0.006200679",
        "y": "0.75753",
        "z": "2.275903"
      },
      "ShoulderLeft": {
        "x": "-0.1754318",
        "y": "0.4679816",
        "z": "2.270424"
      },
      "ElbowLeft": {
        "x": "-0.3620061",
        "y": "0.3911741",
        "z": "2.2741"
      },
      "WristLeft": {
        "x": "-0.4312076",
        "y": "0.5758772",
        "z": "2.124588"
      },
      "HandLeft": {
        "x": "-0.4415897",
        "y": "0.6071157",
        "z": "2.120139"
      },
      "ShoulderRight": {
        "x": "0.1975854",
        "y": "0.4810971",
        "z": "2.280515"
      },
      "ElbowRight": {
        "x": "0.4098611",
        "y": "0.3720092",
        "z": "2.312004"
      },
      "WristRight": {
        "x": "0.4415734",
        "y": "0.5690107",
        "z": "2.145001"
      },
      "HandRight": {
        "x": "0.4487999",
        "y": "0.6473451",
        "z": "2.131392"
      },
      "HipLeft": {
        "x": "-0.06238545",
        "y": "-0.01555328",
        "z": "2.260556"
      },
      "KneeLeft": {
        "x": "-0.116612",
        "y": "-0.3199421",
        "z": "2.24889"
      },
      "AnkleLeft": {
        "x": "-0.141617",
        "y": "-0.6179057",
        "z": "2.381845"
      },
      "FootLeft": {
        "x": "-0.1516734",
        "y": "-0.6957726",
        "z": "2.326478"
      },
      "HipRight": {
        "x": "0.08736285",
        "y": "-0.01341124",
        "z": "2.261334"
      },
      "KneeRight": {
        "x": "0.1430646",
        "y": "-0.3099516",
        "z": "2.262964"
      },
      "AnkleRight": {
        "x": "0.1588557",
        "y": "-0.614314",
        "z": "2.396872"
      },
      "FootRight": {
        "x": "0.1550133",
        "y": "-0.6817552",
        "z": "2.349456"
      },
      "SpineShoulder": {
        "x": "0.006773544",
        "y": "0.5260016",
        "z": "2.288556"
      },
      "HandTipLeft": {
        "x": "-0.4650524",
        "y": "0.6893598",
        "z": "2.123287"
      },
      "ThumbLeft": {
        "x": "-0.3818468",
        "y": "0.6090578",
        "z": "2.11275"
      },
      "HandTipRight": {
        "x": "0.4544295",
        "y": "0.7128758",
        "z": "2.099298"
      },
      "ThumbRight": {
        "x": "0.4995884",
        "y": "0.643874",
        "z": "2.110786"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.0134545",
        "y": "-0.02078339",
        "z": "2.299849"
      },
      "SpineMid": {
        "x": "0.0100589",
        "y": "0.2953748",
        "z": "2.298149"
      },
      "Neck": {
        "x": "0.006337162",
        "y": "0.5987034",
        "z": "2.284509"
      },
      "Head": {
        "x": "0.007318962",
        "y": "0.7561749",
        "z": "2.277791"
      },
      "ShoulderLeft": {
        "x": "-0.1731446",
        "y": "0.459991",
        "z": "2.279612"
      },
      "ElbowLeft": {
        "x": "-0.3389222",
        "y": "0.3518147",
        "z": "2.296837"
      },
      "WristLeft": {
        "x": "-0.4369991",
        "y": "0.5117652",
        "z": "2.143788"
      },
      "HandLeft": {
        "x": "-0.4508364",
        "y": "0.5479942",
        "z": "2.135543"
      },
      "ShoulderRight": {
        "x": "0.1960699",
        "y": "0.4709057",
        "z": "2.287591"
      },
      "ElbowRight": {
        "x": "0.3815107",
        "y": "0.32582",
        "z": "2.352434"
      },
      "WristRight": {
        "x": "0.4399718",
        "y": "0.5133743",
        "z": "2.168607"
      },
      "HandRight": {
        "x": "0.4543275",
        "y": "0.5803261",
        "z": "2.138362"
      },
      "HipLeft": {
        "x": "-0.0618139",
        "y": "-0.0217775",
        "z": "2.262831"
      },
      "KneeLeft": {
        "x": "-0.1182602",
        "y": "-0.3231566",
        "z": "2.248243"
      },
      "AnkleLeft": {
        "x": "-0.1421122",
        "y": "-0.6209827",
        "z": "2.379859"
      },
      "FootLeft": {
        "x": "-0.1516804",
        "y": "-0.6964047",
        "z": "2.326214"
      },
      "HipRight": {
        "x": "0.08825822",
        "y": "-0.01915056",
        "z": "2.26318"
      },
      "KneeRight": {
        "x": "0.1451976",
        "y": "-0.3142564",
        "z": "2.260087"
      },
      "AnkleRight": {
        "x": "0.1595547",
        "y": "-0.6160902",
        "z": "2.396312"
      },
      "FootRight": {
        "x": "0.1550992",
        "y": "-0.6822466",
        "z": "2.349025"
      },
      "SpineShoulder": {
        "x": "0.007282573",
        "y": "0.5245208",
        "z": "2.290008"
      },
      "HandTipLeft": {
        "x": "-0.4822669",
        "y": "0.6220491",
        "z": "2.136434"
      },
      "ThumbLeft": {
        "x": "-0.3949099",
        "y": "0.5563462",
        "z": "2.120333"
      },
      "HandTipRight": {
        "x": "0.4766567",
        "y": "0.650929",
        "z": "2.105618"
      },
      "ThumbRight": {
        "x": "0.4916306",
        "y": "0.5505647",
        "z": "2.116286"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01377186",
        "y": "-0.02226927",
        "z": "2.300579"
      },
      "SpineMid": {
        "x": "0.01073495",
        "y": "0.2940818",
        "z": "2.299095"
      },
      "Neck": {
        "x": "0.007399427",
        "y": "0.5979632",
        "z": "2.285532"
      },
      "Head": {
        "x": "0.008318409",
        "y": "0.7553945",
        "z": "2.278771"
      },
      "ShoulderLeft": {
        "x": "-0.1725304",
        "y": "0.4584933",
        "z": "2.285714"
      },
      "ElbowLeft": {
        "x": "-0.3414764",
        "y": "0.3549537",
        "z": "2.298554"
      },
      "WristLeft": {
        "x": "-0.4373809",
        "y": "0.5135255",
        "z": "2.145532"
      },
      "HandLeft": {
        "x": "-0.4520673",
        "y": "0.5564505",
        "z": "2.139417"
      },
      "ShoulderRight": {
        "x": "0.1960898",
        "y": "0.4685085",
        "z": "2.291544"
      },
      "ElbowRight": {
        "x": "0.3830515",
        "y": "0.3276577",
        "z": "2.354243"
      },
      "WristRight": {
        "x": "0.4406945",
        "y": "0.514349",
        "z": "2.169534"
      },
      "HandRight": {
        "x": "0.4550327",
        "y": "0.5839335",
        "z": "2.143197"
      },
      "HipLeft": {
        "x": "-0.06150948",
        "y": "-0.02325603",
        "z": "2.263617"
      },
      "KneeLeft": {
        "x": "-0.1188114",
        "y": "-0.3244744",
        "z": "2.247183"
      },
      "AnkleLeft": {
        "x": "-0.1418849",
        "y": "-0.6242207",
        "z": "2.379485"
      },
      "FootLeft": {
        "x": "-0.1514712",
        "y": "-0.6969297",
        "z": "2.325994"
      },
      "HipRight": {
        "x": "0.0885835",
        "y": "-0.02058928",
        "z": "2.263853"
      },
      "KneeRight": {
        "x": "0.1462246",
        "y": "-0.3160393",
        "z": "2.258288"
      },
      "AnkleRight": {
        "x": "0.159289",
        "y": "-0.6179339",
        "z": "2.395002"
      },
      "FootRight": {
        "x": "0.1552045",
        "y": "-0.6830178",
        "z": "2.349019"
      },
      "SpineShoulder": {
        "x": "0.008247137",
        "y": "0.5236246",
        "z": "2.291033"
      },
      "HandTipLeft": {
        "x": "-0.4848617",
        "y": "0.6297033",
        "z": "2.13862"
      },
      "ThumbLeft": {
        "x": "-0.3975685",
        "y": "0.5659996",
        "z": "2.130067"
      },
      "HandTipRight": {
        "x": "0.4800363",
        "y": "0.6584191",
        "z": "2.107712"
      },
      "ThumbRight": {
        "x": "0.4921526",
        "y": "0.5540266",
        "z": "2.118094"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01409144",
        "y": "-0.02272583",
        "z": "2.301252"
      },
      "SpineMid": {
        "x": "0.01130705",
        "y": "0.2935133",
        "z": "2.300553"
      },
      "Neck": {
        "x": "0.008341947",
        "y": "0.5976436",
        "z": "2.287915"
      },
      "Head": {
        "x": "0.009271584",
        "y": "0.7549767",
        "z": "2.279902"
      },
      "ShoulderLeft": {
        "x": "-0.1719555",
        "y": "0.4589583",
        "z": "2.288271"
      },
      "ElbowLeft": {
        "x": "-0.348648",
        "y": "0.3745903",
        "z": "2.306438"
      },
      "WristLeft": {
        "x": "-0.4376256",
        "y": "0.538026",
        "z": "2.143618"
      },
      "HandLeft": {
        "x": "-0.4556878",
        "y": "0.6001607",
        "z": "2.14621"
      },
      "ShoulderRight": {
        "x": "0.1961208",
        "y": "0.468273",
        "z": "2.293211"
      },
      "ElbowRight": {
        "x": "0.3953646",
        "y": "0.3487147",
        "z": "2.351107"
      },
      "WristRight": {
        "x": "0.4441951",
        "y": "0.5302228",
        "z": "2.158578"
      },
      "HandRight": {
        "x": "0.456438",
        "y": "0.6104243",
        "z": "2.147425"
      },
      "HipLeft": {
        "x": "-0.06125116",
        "y": "-0.02371531",
        "z": "2.264157"
      },
      "KneeLeft": {
        "x": "-0.1189188",
        "y": "-0.3255665",
        "z": "2.246781"
      },
      "AnkleLeft": {
        "x": "-0.1421809",
        "y": "-0.6250724",
        "z": "2.378721"
      },
      "FootLeft": {
        "x": "-0.1515328",
        "y": "-0.6969464",
        "z": "2.3261"
      },
      "HipRight": {
        "x": "0.08896635",
        "y": "-0.02102364",
        "z": "2.26468"
      },
      "KneeRight": {
        "x": "0.1469812",
        "y": "-0.3154162",
        "z": "2.256808"
      },
      "AnkleRight": {
        "x": "0.1594368",
        "y": "-0.6186313",
        "z": "2.394888"
      },
      "FootRight": {
        "x": "0.155165",
        "y": "-0.6836096",
        "z": "2.348325"
      },
      "SpineShoulder": {
        "x": "0.009090987",
        "y": "0.5232041",
        "z": "2.293197"
      },
      "HandTipLeft": {
        "x": "-0.4816055",
        "y": "0.6785565",
        "z": "2.154393"
      },
      "ThumbLeft": {
        "x": "-0.395766",
        "y": "0.5978773",
        "z": "2.126556"
      },
      "HandTipRight": {
        "x": "0.4693096",
        "y": "0.6832792",
        "z": "2.123431"
      },
      "ThumbRight": {
        "x": "0.5011727",
        "y": "0.6066478",
        "z": "2.120857"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01434819",
        "y": "-0.02222948",
        "z": "2.301788"
      },
      "SpineMid": {
        "x": "0.011863",
        "y": "0.2937697",
        "z": "2.301539"
      },
      "Neck": {
        "x": "0.009382404",
        "y": "0.5977228",
        "z": "2.289488"
      },
      "Head": {
        "x": "0.01036342",
        "y": "0.7552975",
        "z": "2.281873"
      },
      "ShoulderLeft": {
        "x": "-0.1723774",
        "y": "0.4605813",
        "z": "2.290869"
      },
      "ElbowLeft": {
        "x": "-0.356083",
        "y": "0.3993639",
        "z": "2.316578"
      },
      "WristLeft": {
        "x": "-0.4442923",
        "y": "0.6039306",
        "z": "2.169859"
      },
      "HandLeft": {
        "x": "-0.4524205",
        "y": "0.6497514",
        "z": "2.1502"
      },
      "ShoulderRight": {
        "x": "0.1968765",
        "y": "0.4694315",
        "z": "2.295302"
      },
      "ElbowRight": {
        "x": "0.4212766",
        "y": "0.3927621",
        "z": "2.33844"
      },
      "WristRight": {
        "x": "0.4513104",
        "y": "0.5851614",
        "z": "2.167676"
      },
      "HandRight": {
        "x": "0.4549792",
        "y": "0.6614839",
        "z": "2.150873"
      },
      "HipLeft": {
        "x": "-0.06106007",
        "y": "-0.02327297",
        "z": "2.264918"
      },
      "KneeLeft": {
        "x": "-0.1189221",
        "y": "-0.3255625",
        "z": "2.246838"
      },
      "AnkleLeft": {
        "x": "-0.1420615",
        "y": "-0.6249664",
        "z": "2.378823"
      },
      "FootLeft": {
        "x": "-0.1515047",
        "y": "-0.6968873",
        "z": "2.326102"
      },
      "HipRight": {
        "x": "0.08929057",
        "y": "-0.02046502",
        "z": "2.26504"
      },
      "KneeRight": {
        "x": "0.1477494",
        "y": "-0.3149793",
        "z": "2.256467"
      },
      "AnkleRight": {
        "x": "0.1600122",
        "y": "-0.6190009",
        "z": "2.39479"
      },
      "FootRight": {
        "x": "0.1551866",
        "y": "-0.6839731",
        "z": "2.348327"
      },
      "SpineShoulder": {
        "x": "0.01000089",
        "y": "0.5233254",
        "z": "2.294632"
      },
      "HandTipLeft": {
        "x": "-0.4747483",
        "y": "0.728356",
        "z": "2.153485"
      },
      "ThumbLeft": {
        "x": "-0.3917832",
        "y": "0.6453375",
        "z": "2.133556"
      },
      "HandTipRight": {
        "x": "0.467004",
        "y": "0.7365362",
        "z": "2.133741"
      },
      "ThumbRight": {
        "x": "0.5074682",
        "y": "0.6587113",
        "z": "2.127"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01482299",
        "y": "-0.02028521",
        "z": "2.302825"
      },
      "SpineMid": {
        "x": "0.01242641",
        "y": "0.2950203",
        "z": "2.303193"
      },
      "Neck": {
        "x": "0.01011208",
        "y": "0.5986009",
        "z": "2.291898"
      },
      "Head": {
        "x": "0.01149112",
        "y": "0.755849",
        "z": "2.28356"
      },
      "ShoulderLeft": {
        "x": "-0.1733515",
        "y": "0.4634302",
        "z": "2.291847"
      },
      "ElbowLeft": {
        "x": "-0.3648213",
        "y": "0.4315359",
        "z": "2.319371"
      },
      "WristLeft": {
        "x": "-0.4439395",
        "y": "0.6260868",
        "z": "2.168252"
      },
      "HandLeft": {
        "x": "-0.4473875",
        "y": "0.7032818",
        "z": "2.153401"
      },
      "ShoulderRight": {
        "x": "0.1998588",
        "y": "0.4734975",
        "z": "2.297694"
      },
      "ElbowRight": {
        "x": "0.4282005",
        "y": "0.4252567",
        "z": "2.331913"
      },
      "WristRight": {
        "x": "0.4543149",
        "y": "0.621727",
        "z": "2.163134"
      },
      "HandRight": {
        "x": "0.4567114",
        "y": "0.7031719",
        "z": "2.153407"
      },
      "HipLeft": {
        "x": "-0.06067004",
        "y": "-0.02154579",
        "z": "2.265746"
      },
      "KneeLeft": {
        "x": "-0.1184396",
        "y": "-0.325408",
        "z": "2.247242"
      },
      "AnkleLeft": {
        "x": "-0.1419416",
        "y": "-0.6245125",
        "z": "2.378978"
      },
      "FootLeft": {
        "x": "-0.1513263",
        "y": "-0.6962267",
        "z": "2.326346"
      },
      "HipRight": {
        "x": "0.08984121",
        "y": "-0.01836369",
        "z": "2.266286"
      },
      "KneeRight": {
        "x": "0.1482835",
        "y": "-0.3137319",
        "z": "2.257106"
      },
      "AnkleRight": {
        "x": "0.1601209",
        "y": "-0.6190424",
        "z": "2.394853"
      },
      "FootRight": {
        "x": "0.1551498",
        "y": "-0.6840041",
        "z": "2.348358"
      },
      "SpineShoulder": {
        "x": "0.01068711",
        "y": "0.524289",
        "z": "2.296853"
      },
      "HandTipLeft": {
        "x": "-0.4641492",
        "y": "0.7879404",
        "z": "2.161582"
      },
      "ThumbLeft": {
        "x": "-0.3893781",
        "y": "0.6879248",
        "z": "2.1358"
      },
      "HandTipRight": {
        "x": "0.463731",
        "y": "0.776902",
        "z": "2.137808"
      },
      "ThumbRight": {
        "x": "0.5064182",
        "y": "0.6933084",
        "z": "2.132576"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01543489",
        "y": "-0.01687751",
        "z": "2.304739"
      },
      "SpineMid": {
        "x": "0.01338392",
        "y": "0.2969985",
        "z": "2.305372"
      },
      "Neck": {
        "x": "0.01141776",
        "y": "0.5996704",
        "z": "2.294315"
      },
      "Head": {
        "x": "0.01258673",
        "y": "0.7565637",
        "z": "2.286443"
      },
      "ShoulderLeft": {
        "x": "-0.1734775",
        "y": "0.4677412",
        "z": "2.292127"
      },
      "ElbowLeft": {
        "x": "-0.3992763",
        "y": "0.4922177",
        "z": "2.317835"
      },
      "WristLeft": {
        "x": "-0.4424494",
        "y": "0.6828781",
        "z": "2.168239"
      },
      "HandLeft": {
        "x": "-0.4406572",
        "y": "0.7487127",
        "z": "2.159816"
      },
      "ShoulderRight": {
        "x": "0.2035698",
        "y": "0.4798296",
        "z": "2.299535"
      },
      "ElbowRight": {
        "x": "0.4313637",
        "y": "0.4749382",
        "z": "2.316761"
      },
      "WristRight": {
        "x": "0.4568338",
        "y": "0.6891975",
        "z": "2.166754"
      },
      "HandRight": {
        "x": "0.4546697",
        "y": "0.736595",
        "z": "2.158155"
      },
      "HipLeft": {
        "x": "-0.0600017",
        "y": "-0.01811692",
        "z": "2.268152"
      },
      "KneeLeft": {
        "x": "-0.1173097",
        "y": "-0.3247238",
        "z": "2.250803"
      },
      "AnkleLeft": {
        "x": "-0.1419067",
        "y": "-0.6241524",
        "z": "2.379309"
      },
      "FootLeft": {
        "x": "-0.1514258",
        "y": "-0.6965193",
        "z": "2.326711"
      },
      "HipRight": {
        "x": "0.09038502",
        "y": "-0.01507369",
        "z": "2.267731"
      },
      "KneeRight": {
        "x": "0.1485619",
        "y": "-0.3112654",
        "z": "2.259425"
      },
      "AnkleRight": {
        "x": "0.1602804",
        "y": "-0.6179298",
        "z": "2.395341"
      },
      "FootRight": {
        "x": "0.1551466",
        "y": "-0.6829304",
        "z": "2.349019"
      },
      "SpineShoulder": {
        "x": "0.01190364",
        "y": "0.5255581",
        "z": "2.299216"
      },
      "HandTipLeft": {
        "x": "-0.4458432",
        "y": "0.8352504",
        "z": "2.163418"
      },
      "ThumbLeft": {
        "x": "-0.3848551",
        "y": "0.7306186",
        "z": "2.141316"
      },
      "HandTipRight": {
        "x": "0.4621961",
        "y": "0.8186154",
        "z": "2.150652"
      },
      "ThumbRight": {
        "x": "0.5034654",
        "y": "0.7273047",
        "z": "2.136"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01604972",
        "y": "-0.0145042",
        "z": "2.305725"
      },
      "SpineMid": {
        "x": "0.01380851",
        "y": "0.2984295",
        "z": "2.306613"
      },
      "Neck": {
        "x": "0.01169023",
        "y": "0.6004431",
        "z": "2.295669"
      },
      "Head": {
        "x": "0.01293216",
        "y": "0.7580433",
        "z": "2.288342"
      },
      "ShoulderLeft": {
        "x": "-0.174277",
        "y": "0.4730765",
        "z": "2.291077"
      },
      "ElbowLeft": {
        "x": "-0.4114959",
        "y": "0.4959398",
        "z": "2.311708"
      },
      "WristLeft": {
        "x": "-0.4425308",
        "y": "0.7062017",
        "z": "2.175341"
      },
      "HandLeft": {
        "x": "-0.4353555",
        "y": "0.7815025",
        "z": "2.162412"
      },
      "ShoulderRight": {
        "x": "0.2061521",
        "y": "0.4870299",
        "z": "2.299157"
      },
      "ElbowRight": {
        "x": "0.444115",
        "y": "0.4861544",
        "z": "2.311948"
      },
      "WristRight": {
        "x": "0.4572169",
        "y": "0.6969467",
        "z": "2.167507"
      },
      "HandRight": {
        "x": "0.4538236",
        "y": "0.7582458",
        "z": "2.159383"
      },
      "HipLeft": {
        "x": "-0.05924292",
        "y": "-0.01574007",
        "z": "2.269125"
      },
      "KneeLeft": {
        "x": "-0.1159613",
        "y": "-0.323456",
        "z": "2.253822"
      },
      "AnkleLeft": {
        "x": "-0.1418331",
        "y": "-0.6235934",
        "z": "2.379973"
      },
      "FootLeft": {
        "x": "-0.1513936",
        "y": "-0.6963907",
        "z": "2.326967"
      },
      "HipRight": {
        "x": "0.09083746",
        "y": "-0.01279121",
        "z": "2.268681"
      },
      "KneeRight": {
        "x": "0.1487625",
        "y": "-0.3094838",
        "z": "2.2621"
      },
      "AnkleRight": {
        "x": "0.1602395",
        "y": "-0.616762",
        "z": "2.39612"
      },
      "FootRight": {
        "x": "0.1551462",
        "y": "-0.6821297",
        "z": "2.349123"
      },
      "SpineShoulder": {
        "x": "0.01221213",
        "y": "0.5264735",
        "z": "2.300552"
      },
      "HandTipLeft": {
        "x": "-0.4354804",
        "y": "0.8661538",
        "z": "2.165677"
      },
      "ThumbLeft": {
        "x": "-0.3796885",
        "y": "0.7587622",
        "z": "2.139809"
      },
      "HandTipRight": {
        "x": "0.4508702",
        "y": "0.8399093",
        "z": "2.154542"
      },
      "ThumbRight": {
        "x": "0.5013347",
        "y": "0.7684451",
        "z": "2.138379"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01632107",
        "y": "-0.01270489",
        "z": "2.307242"
      },
      "SpineMid": {
        "x": "0.0143115",
        "y": "0.3000669",
        "z": "2.308075"
      },
      "Neck": {
        "x": "0.01235505",
        "y": "0.6018485",
        "z": "2.296914"
      },
      "Head": {
        "x": "0.01348011",
        "y": "0.7590252",
        "z": "2.290842"
      },
      "ShoulderLeft": {
        "x": "-0.1749777",
        "y": "0.4761022",
        "z": "2.290042"
      },
      "ElbowLeft": {
        "x": "-0.4209299",
        "y": "0.5091001",
        "z": "2.299774"
      },
      "WristLeft": {
        "x": "-0.4381942",
        "y": "0.7187535",
        "z": "2.176931"
      },
      "HandLeft": {
        "x": "-0.4302125",
        "y": "0.8025485",
        "z": "2.167221"
      },
      "ShoulderRight": {
        "x": "0.206964",
        "y": "0.4906954",
        "z": "2.298466"
      },
      "ElbowRight": {
        "x": "0.4498527",
        "y": "0.5043548",
        "z": "2.301146"
      },
      "WristRight": {
        "x": "0.45888",
        "y": "0.7094718",
        "z": "2.170053"
      },
      "HandRight": {
        "x": "0.4565076",
        "y": "0.7802357",
        "z": "2.162291"
      },
      "HipLeft": {
        "x": "-0.05881596",
        "y": "-0.01360819",
        "z": "2.271591"
      },
      "KneeLeft": {
        "x": "-0.1150937",
        "y": "-0.3221645",
        "z": "2.258115"
      },
      "AnkleLeft": {
        "x": "-0.1418337",
        "y": "-0.6229589",
        "z": "2.380931"
      },
      "FootLeft": {
        "x": "-0.1513103",
        "y": "-0.696276",
        "z": "2.327031"
      },
      "HipRight": {
        "x": "0.09098477",
        "y": "-0.01132323",
        "z": "2.269458"
      },
      "KneeRight": {
        "x": "0.1485105",
        "y": "-0.3073865",
        "z": "2.265399"
      },
      "AnkleRight": {
        "x": "0.1601994",
        "y": "-0.6165316",
        "z": "2.396834"
      },
      "FootRight": {
        "x": "0.1551344",
        "y": "-0.6821297",
        "z": "2.349242"
      },
      "SpineShoulder": {
        "x": "0.01284374",
        "y": "0.5279369",
        "z": "2.301865"
      },
      "HandTipLeft": {
        "x": "-0.4289323",
        "y": "0.8892283",
        "z": "2.166623"
      },
      "ThumbLeft": {
        "x": "-0.3775886",
        "y": "0.7758823",
        "z": "2.14608"
      },
      "HandTipRight": {
        "x": "0.4554582",
        "y": "0.8630955",
        "z": "2.156274"
      },
      "ThumbRight": {
        "x": "0.5001839",
        "y": "0.7693185",
        "z": "2.139345"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.0164535",
        "y": "-0.01198956",
        "z": "2.308066"
      },
      "SpineMid": {
        "x": "0.01433637",
        "y": "0.300815",
        "z": "2.308897"
      },
      "Neck": {
        "x": "0.01226574",
        "y": "0.6025943",
        "z": "2.297643"
      },
      "Head": {
        "x": "0.0136805",
        "y": "0.7597708",
        "z": "2.293037"
      },
      "ShoulderLeft": {
        "x": "-0.1753284",
        "y": "0.4778716",
        "z": "2.289459"
      },
      "ElbowLeft": {
        "x": "-0.4137093",
        "y": "0.5223778",
        "z": "2.301038"
      },
      "WristLeft": {
        "x": "-0.4340884",
        "y": "0.7264788",
        "z": "2.176699"
      },
      "HandLeft": {
        "x": "-0.4265369",
        "y": "0.806714",
        "z": "2.168111"
      },
      "ShoulderRight": {
        "x": "0.2072735",
        "y": "0.4922757",
        "z": "2.297772"
      },
      "ElbowRight": {
        "x": "0.4501655",
        "y": "0.5074331",
        "z": "2.312479"
      },
      "WristRight": {
        "x": "0.4596158",
        "y": "0.7133347",
        "z": "2.170755"
      },
      "HandRight": {
        "x": "0.4569414",
        "y": "0.7820807",
        "z": "2.162389"
      },
      "HipLeft": {
        "x": "-0.05864208",
        "y": "-0.01296096",
        "z": "2.272355"
      },
      "KneeLeft": {
        "x": "-0.1141697",
        "y": "-0.3218395",
        "z": "2.260284"
      },
      "AnkleLeft": {
        "x": "-0.1417147",
        "y": "-0.6221232",
        "z": "2.381411"
      },
      "FootLeft": {
        "x": "-0.1511938",
        "y": "-0.6960703",
        "z": "2.327108"
      },
      "HipRight": {
        "x": "0.09105866",
        "y": "-0.01059731",
        "z": "2.27025"
      },
      "KneeRight": {
        "x": "0.1478119",
        "y": "-0.3058691",
        "z": "2.269816"
      },
      "AnkleRight": {
        "x": "0.15994",
        "y": "-0.6158525",
        "z": "2.396988"
      },
      "FootRight": {
        "x": "0.1550239",
        "y": "-0.6812922",
        "z": "2.349033"
      },
      "SpineShoulder": {
        "x": "0.01278283",
        "y": "0.5286841",
        "z": "2.302626"
      },
      "HandTipLeft": {
        "x": "-0.4266796",
        "y": "0.8916548",
        "z": "2.172194"
      },
      "ThumbLeft": {
        "x": "-0.3689896",
        "y": "0.7913147",
        "z": "2.147714"
      },
      "HandTipRight": {
        "x": "0.4535295",
        "y": "0.8658467",
        "z": "2.161865"
      },
      "ThumbRight": {
        "x": "0.5007811",
        "y": "0.7745145",
        "z": "2.138566"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01665799",
        "y": "-0.01241799",
        "z": "2.309292"
      },
      "SpineMid": {
        "x": "0.01444334",
        "y": "0.3007597",
        "z": "2.310211"
      },
      "Neck": {
        "x": "0.01226662",
        "y": "0.6029204",
        "z": "2.299039"
      },
      "Head": {
        "x": "0.01339643",
        "y": "0.7602658",
        "z": "2.296417"
      },
      "ShoulderLeft": {
        "x": "-0.1751272",
        "y": "0.4777734",
        "z": "2.289288"
      },
      "ElbowLeft": {
        "x": "-0.4083917",
        "y": "0.5098895",
        "z": "2.303694"
      },
      "WristLeft": {
        "x": "-0.4360327",
        "y": "0.7207098",
        "z": "2.176943"
      },
      "HandLeft": {
        "x": "-0.4366689",
        "y": "0.7803083",
        "z": "2.166406"
      },
      "ShoulderRight": {
        "x": "0.2072432",
        "y": "0.4922414",
        "z": "2.297747"
      },
      "ElbowRight": {
        "x": "0.4479088",
        "y": "0.4916066",
        "z": "2.293873"
      },
      "WristRight": {
        "x": "0.4634963",
        "y": "0.707895",
        "z": "2.169276"
      },
      "HandRight": {
        "x": "0.4705685",
        "y": "0.7639606",
        "z": "2.161035"
      },
      "HipLeft": {
        "x": "-0.05848982",
        "y": "-0.01343664",
        "z": "2.27356"
      },
      "KneeLeft": {
        "x": "-0.1135046",
        "y": "-0.3240099",
        "z": "2.264498"
      },
      "AnkleLeft": {
        "x": "-0.1417307",
        "y": "-0.6215822",
        "z": "2.382047"
      },
      "FootLeft": {
        "x": "-0.151322",
        "y": "-0.6956104",
        "z": "2.327722"
      },
      "HipRight": {
        "x": "0.09129766",
        "y": "-0.01096198",
        "z": "2.271411"
      },
      "KneeRight": {
        "x": "0.1469411",
        "y": "-0.3060409",
        "z": "2.274912"
      },
      "AnkleRight": {
        "x": "0.159913",
        "y": "-0.614542",
        "z": "2.397875"
      },
      "FootRight": {
        "x": "0.1548779",
        "y": "-0.6813856",
        "z": "2.349211"
      },
      "SpineShoulder": {
        "x": "0.01281178",
        "y": "0.5289102",
        "z": "2.304004"
      },
      "HandTipLeft": {
        "x": "-0.4372629",
        "y": "0.8609801",
        "z": "2.170316"
      },
      "ThumbLeft": {
        "x": "-0.3784215",
        "y": "0.7544259",
        "z": "2.139643"
      },
      "HandTipRight": {
        "x": "0.4780214",
        "y": "0.8421491",
        "z": "2.150522"
      },
      "ThumbRight": {
        "x": "0.5206591",
        "y": "0.7563161",
        "z": "2.142"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01673457",
        "y": "-0.0129774",
        "z": "2.309569"
      },
      "SpineMid": {
        "x": "0.01447212",
        "y": "0.3005202",
        "z": "2.310924"
      },
      "Neck": {
        "x": "0.01222022",
        "y": "0.6031108",
        "z": "2.30059"
      },
      "Head": {
        "x": "0.01315141",
        "y": "0.7604448",
        "z": "2.297592"
      },
      "ShoulderLeft": {
        "x": "-0.1748781",
        "y": "0.4774667",
        "z": "2.289261"
      },
      "ElbowLeft": {
        "x": "-0.3938995",
        "y": "0.4790227",
        "z": "2.29265"
      },
      "WristLeft": {
        "x": "-0.453864",
        "y": "0.6736197",
        "z": "2.1754"
      },
      "HandLeft": {
        "x": "-0.4514191",
        "y": "0.7425993",
        "z": "2.153544"
      },
      "ShoulderRight": {
        "x": "0.2064573",
        "y": "0.4916487",
        "z": "2.296962"
      },
      "ElbowRight": {
        "x": "0.4441085",
        "y": "0.4570468",
        "z": "2.286502"
      },
      "WristRight": {
        "x": "0.4781128",
        "y": "0.6745269",
        "z": "2.162112"
      },
      "HandRight": {
        "x": "0.4842267",
        "y": "0.737254",
        "z": "2.15099"
      },
      "HipLeft": {
        "x": "-0.05841818",
        "y": "-0.01400332",
        "z": "2.273943"
      },
      "KneeLeft": {
        "x": "-0.1136196",
        "y": "-0.3247962",
        "z": "2.266415"
      },
      "AnkleLeft": {
        "x": "-0.1415852",
        "y": "-0.6214244",
        "z": "2.382842"
      },
      "FootLeft": {
        "x": "-0.1513241",
        "y": "-0.6955075",
        "z": "2.327741"
      },
      "HipRight": {
        "x": "0.09137509",
        "y": "-0.01150763",
        "z": "2.271577"
      },
      "KneeRight": {
        "x": "0.1466334",
        "y": "-0.3063158",
        "z": "2.275919"
      },
      "AnkleRight": {
        "x": "0.1598861",
        "y": "-0.6142796",
        "z": "2.397887"
      },
      "FootRight": {
        "x": "0.1547689",
        "y": "-0.6813248",
        "z": "2.349231"
      },
      "SpineShoulder": {
        "x": "0.01278989",
        "y": "0.5289617",
        "z": "2.305309"
      },
      "HandTipLeft": {
        "x": "-0.4552819",
        "y": "0.8251908",
        "z": "2.152515"
      },
      "ThumbLeft": {
        "x": "-0.3947066",
        "y": "0.7241003",
        "z": "2.1307"
      },
      "HandTipRight": {
        "x": "0.4948955",
        "y": "0.809415",
        "z": "2.140379"
      },
      "ThumbRight": {
        "x": "0.5287707",
        "y": "0.7227172",
        "z": "2.13473"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01693102",
        "y": "-0.01419331",
        "z": "2.310122"
      },
      "SpineMid": {
        "x": "0.01432471",
        "y": "0.3000272",
        "z": "2.312489"
      },
      "Neck": {
        "x": "0.01146278",
        "y": "0.6036101",
        "z": "2.304121"
      },
      "Head": {
        "x": "0.01243477",
        "y": "0.7606673",
        "z": "2.300673"
      },
      "ShoulderLeft": {
        "x": "-0.17379",
        "y": "0.47605",
        "z": "2.290404"
      },
      "ElbowLeft": {
        "x": "-0.3881708",
        "y": "0.4617772",
        "z": "2.297386"
      },
      "WristLeft": {
        "x": "-0.4736274",
        "y": "0.6396856",
        "z": "2.172793"
      },
      "HandLeft": {
        "x": "-0.4722643",
        "y": "0.7024356",
        "z": "2.144063"
      },
      "ShoulderRight": {
        "x": "0.2052449",
        "y": "0.4907615",
        "z": "2.296917"
      },
      "ElbowRight": {
        "x": "0.4133574",
        "y": "0.4632749",
        "z": "2.278822"
      },
      "WristRight": {
        "x": "0.4910543",
        "y": "0.6497015",
        "z": "2.153801"
      },
      "HandRight": {
        "x": "0.5036443",
        "y": "0.7018933",
        "z": "2.140046"
      },
      "HipLeft": {
        "x": "-0.05824903",
        "y": "-0.01511341",
        "z": "2.274431"
      },
      "KneeLeft": {
        "x": "-0.1137265",
        "y": "-0.3258327",
        "z": "2.267809"
      },
      "AnkleLeft": {
        "x": "-0.1414045",
        "y": "-0.6217151",
        "z": "2.383498"
      },
      "FootLeft": {
        "x": "-0.1512459",
        "y": "-0.6955236",
        "z": "2.32787"
      },
      "HipRight": {
        "x": "0.09158937",
        "y": "-0.01279155",
        "z": "2.272167"
      },
      "KneeRight": {
        "x": "0.146528",
        "y": "-0.3079055",
        "z": "2.277064"
      },
      "AnkleRight": {
        "x": "0.1595621",
        "y": "-0.6154365",
        "z": "2.398552"
      },
      "FootRight": {
        "x": "0.1546155",
        "y": "-0.6816169",
        "z": "2.349685"
      },
      "SpineShoulder": {
        "x": "0.0122204",
        "y": "0.5291439",
        "z": "2.308267"
      },
      "HandTipLeft": {
        "x": "-0.4853719",
        "y": "0.783363",
        "z": "2.138479"
      },
      "ThumbLeft": {
        "x": "-0.4429896",
        "y": "0.7441039",
        "z": "2.129"
      },
      "HandTipRight": {
        "x": "0.5301988",
        "y": "0.7801456",
        "z": "2.131452"
      },
      "ThumbRight": {
        "x": "0.5416532",
        "y": "0.6754936",
        "z": "2.116761"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01678342",
        "y": "-0.01557202",
        "z": "2.31041"
      },
      "SpineMid": {
        "x": "0.01396297",
        "y": "0.2994916",
        "z": "2.313488"
      },
      "Neck": {
        "x": "0.01074741",
        "y": "0.6037834",
        "z": "2.306067"
      },
      "Head": {
        "x": "0.01165313",
        "y": "0.7604167",
        "z": "2.302188"
      },
      "ShoulderLeft": {
        "x": "-0.1732105",
        "y": "0.4739084",
        "z": "2.292447"
      },
      "ElbowLeft": {
        "x": "-0.376786",
        "y": "0.4352344",
        "z": "2.295329"
      },
      "WristLeft": {
        "x": "-0.4801503",
        "y": "0.6116171",
        "z": "2.163738"
      },
      "HandLeft": {
        "x": "-0.4913862",
        "y": "0.6605487",
        "z": "2.123901"
      },
      "ShoulderRight": {
        "x": "0.2026869",
        "y": "0.4881243",
        "z": "2.296339"
      },
      "ElbowRight": {
        "x": "0.4243227",
        "y": "0.4189504",
        "z": "2.288908"
      },
      "WristRight": {
        "x": "0.5089848",
        "y": "0.6183127",
        "z": "2.132572"
      },
      "HandRight": {
        "x": "0.5220508",
        "y": "0.6731427",
        "z": "2.116915"
      },
      "HipLeft": {
        "x": "-0.05842996",
        "y": "-0.01649649",
        "z": "2.274852"
      },
      "KneeLeft": {
        "x": "-0.1136822",
        "y": "-0.3262428",
        "z": "2.268018"
      },
      "AnkleLeft": {
        "x": "-0.141348",
        "y": "-0.6217597",
        "z": "2.383531"
      },
      "FootLeft": {
        "x": "-0.1511985",
        "y": "-0.6955134",
        "z": "2.327977"
      },
      "HipRight": {
        "x": "0.09147482",
        "y": "-0.01413995",
        "z": "2.272309"
      },
      "KneeRight": {
        "x": "0.1465822",
        "y": "-0.3082342",
        "z": "2.27677"
      },
      "AnkleRight": {
        "x": "0.1593378",
        "y": "-0.6151881",
        "z": "2.39851"
      },
      "FootRight": {
        "x": "0.1545008",
        "y": "-0.681618",
        "z": "2.349682"
      },
      "SpineShoulder": {
        "x": "0.01159925",
        "y": "0.5291194",
        "z": "2.309967"
      },
      "HandTipLeft": {
        "x": "-0.516192",
        "y": "0.7387226",
        "z": "2.119672"
      },
      "ThumbLeft": {
        "x": "-0.4445719",
        "y": "0.6625042",
        "z": "2.100945"
      },
      "HandTipRight": {
        "x": "0.5411099",
        "y": "0.7410644",
        "z": "2.094662"
      },
      "ThumbRight": {
        "x": "0.5673395",
        "y": "0.6515927",
        "z": "2.103226"
      }
    }
  },
  {
     "bodyIndex": 3,
     "joint": {
      "SpineBase": {
        "x": "0.01671548",
        "y": "-0.01650716",
        "z": "2.310745"
      },
      "SpineMid": {
        "x": "0.01379657",
        "y": "0.2989862",
        "z": "2.31433"
      },
      "Neck": {
        "x": "0.01052183",
        "y": "0.6036555",
        "z": "2.307251"
      },
      "Head": {
        "x": "0.01055637",
        "y": "0.7600614",
        "z": "2.305063"
      },
      "ShoulderLeft": {
        "x": "-0.171643",
        "y": "0.4699772",
        "z": "2.298671"
      },
      "ElbowLeft": {
        "x": "-0.3765712",
        "y": "0.4234908",
        "z": "2.293123"
      },
      "WristLeft": {
        "x": "-0.4829698",
        "y": "0.5706075",
        "z": "2.117457"
      },
      "HandLeft": {
        "x": "-0.5058126",
        "y": "0.6276011",
        "z": "2.105578"
      },
      "ShoulderRight": {
        "x": "0.2012133",
        "y": "0.4855308",
        "z": "2.296915"
      },
      "ElbowRight": {
        "x": "0.4237451",
        "y": "0.4132121",
        "z": "2.289421"
      },
      "WristRight": {
        "x": "0.518913",
        "y": "0.5935476",
        "z": "2.116045"
      },
      "HandRight": {
        "x": "0.5361013",
        "y": "0.639296",
        "z": "2.092439"
      },
      "HipLeft": {
        "x": "-0.05857253",
        "y": "-0.01779845",
        "z": "2.275732"
      },
      "KneeLeft": {
        "x": "-0.1136651",
        "y": "-0.3267477",
        "z": "2.267819"
      },
      "AnkleLeft": {
        "x": "-0.14131",
        "y": "-0.6217797",
        "z": "2.383492"
      },
      "FootLeft": {
        "x": "-0.1511883",
        "y": "-0.6955009",
        "z": "2.327979"
      },
      "HipRight": {
        "x": "0.09145624",
        "y": "-0.01482181",
        "z": "2.272276"
      },
      "KneeRight": {
        "x": "0.1465433",
        "y": "-0.3086766",
        "z": "2.275199"
      },
      "AnkleRight": {
        "x": "0.1593122",
        "y": "-0.6155049",
        "z": "2.398298"
      },
      "FootRight": {
        "x": "0.1545047",
        "y": "-0.6820993",
        "z": "2.349675"
      },
      "SpineShoulder": {
        "x": "0.01138077",
        "y": "0.5289069",
        "z": "2.311091"
      },
      "HandTipLeft": {
        "x": "-0.5404664",
        "y": "0.701689",
        "z": "2.102566"
      },
      "ThumbLeft": {
        "x": "-0.4543827",
        "y": "0.6388313",
        "z": "2.091273"
      },
      "HandTipRight": {
        "x": "0.5682631",
        "y": "0.7056731",
        "z": "2.070612"
      },
      "ThumbRight": {
        "x": "0.5727588",
        "y": "0.6074573",
        "z": "2.07793"
      }
    }
  }
];