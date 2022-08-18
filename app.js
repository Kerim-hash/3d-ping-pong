import Viewer from "./viewer.js";
import * as THREE from "./three.module.js";

export default class {
  constructor() {
    Viewer.init({
      renderer: {
        parent: document.body,
        antialias: true,
        alpha: false,
        clearColor: "gray",
        pixelRatio: 1,
      },
    }),
      (this.width = 10);
    this.height = 6;
    this.velocityY = -0.05;
    this.velocity1Y = 0.2;
    (this.velocityX = -0.05), this.createObject();
  }
  createObject() {
    var main = new THREE.Mesh(
      new THREE.BoxBufferGeometry(this.width, this.height, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xa52523 })
    );
    main.position.set(0, 0, 0);
    Viewer.scene.add(main);

    for (let i = 0; i <= 5; i++) {
      var drawNet = new THREE.Mesh(
        new THREE.BoxBufferGeometry(0.2, .2, 0.12),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      drawNet.position.set(0, i - 2.5, 0.2);
      main.add(drawNet);
    }
  

    var player = new THREE.Mesh(
      new THREE.BoxBufferGeometry(0.5, 2, 0.2),
      new THREE.MeshLambertMaterial({ color: 0x000000 })
    );
    player.position.set(-4.75, this.velocity1Y, 0.2);
    main.add(player);

    var com = new THREE.Mesh(
      new THREE.BoxBufferGeometry(0.5, 2, 0.2),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    com.position.set(4.73, 1, 0.2);
    main.add(com);

    var ball = new THREE.Mesh(
      new THREE.CylinderBufferGeometry(0.3, 0.3, 0.1, 60),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    ball.position.set(0, 1, 0.3);
    ball.rotation.set(1.58, 0, 0);
    main.add(ball);

    function collision(b, p) {
      p.top = p.position.y - 1.2;
      p.bottom = p.position.y + 1.2;
      p.left = p.position.x;
      p.right = p.position.x + 0.5;

      b.top = b.position.y - 0.1;
      b.bottom = b.position.y + 0.1;
      b.left = b.position.x - 0.1;
      b.right = b.position.x + 0.1;

      return (
        p.left < b.right &&
        p.top < b.bottom &&
        p.right > b.left &&
        p.bottom > b.top
      );
    }

    function resetBall() {
      ball.position.set(0, 1, 0.3);
      ball.rotation.set(1.57, 0, 0);
      player.position.set(-4.75, 0.2, 0.2);
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp" && player.position.y <= 1.9) {
        player.position.y += 0.4;
      } else if (event.key === "ArrowDown" && player.position.y >= -1.8) {
        player.position.y -= 0.4;
      }
    });

    Viewer.addUpdate("transformaton", () => {
      let player1 = ball.position.x + 0.1 < this.width / 2 ? player : com;
      if (collision(ball, player)) {
        let collidePoint = ball.position.y - (player.position.y + 0.3 / 2);
        collidePoint = collidePoint / (2 / 2);
        let angleRad = (Math.PI / 4) * collidePoint;
        let direction = ball.position.x + 0.3 < this.width / 2 ? 1 : -1;
        this.velocityX = direction * 0.1 * Math.cos(angleRad);
        this.velocityY = 0.1 * Math.sin(angleRad);
      }

      ball.position.y += this.velocityY;
      ball.position.x += this.velocityX;
      com.position.y += (ball.position.y - (com.position.y + 0.3 / 2)) * 0.1;
      // player.position.y += ((ball.position.y - (com.position.y + .3/2)))*0.1;

      if (
        ball.position.y - 0.1 < -2.7 ||
        ball.position.y + 0.1 > this.height - 3.5
      ) {
        this.velocityY = -this.velocityY;
      }

      if (ball.position.x > this.width - 5.7) {
        this.velocityX = -this.velocityX;
      }

      if (ball.position.x + 0.1 > this.width - 4.73) {
        document.getElementById("p1").innerHTML =
          +document.getElementById("p1").innerHTML + 1;
        resetBall();
      }
      if (ball.position.x < -4.6) {
        document.getElementById("p2").innerHTML =
          +document.getElementById("p2").innerHTML + 1;
        resetBall();
      }
    });
  }
}
