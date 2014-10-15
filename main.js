/* global Physics */
/* global memory */
Physics.body('wheel', 'circle', function( parent ) {
    return {
        // no need for an init

        // spin the wheel at desired speed
        spin: function( speed ){
            // the wheels are spinning...
            this.state.angular.vel = speed;
        },

        stop: function(){
            this.state.angular.vel = 0;
        }
    };
});

var PDCPU = (function () {
    function PDCPU(world, pos) {
        this.world = world;
        this.pos = pos;
    }

    PDCPU.Pin = (function () {
        function Pin(pdcpu, type) {
            this.pdcpu = pdcpu;
            this.type = type;
        }

        Pin.prototype.pdcpu = null;

        Pin.prototype.type = null;

        Pin.prototype.bodies = [];

        Pin.prototype.render = function () {
            for (var i = 0; i < 8; i++) {
                this.bodies.push(Physics.body('wheel', {
                    x: this.pdcpu.pos.x, // TODO
                    y: this.pdcpu.pos.y, // TODO
                    radius: 2,
                    restitution: 0.9,
                    mass: 10,
                    styles: {
                        fillStyle: 'rgba(0,0,0,0.6)',
                        angleIndicator: 'rgba(0,0,0,0.6)'
                    }
                }));
            }
        };

        return Pin;
    }());

    PDCPU.prototype.body = null;

    PDCPU.prototype.width = 100;
    PDCPU.prototype.height = 100;

    PDCPU.prototype.world = null;

    // PDCPU.prototype.memory = memory;

    PDCPU.prototype.pins = {
        A: null,
        B: null,
        C: null,
        D: null,
    };

    PDCPU.prototype.init = function () {
        for (var pin in this.pins) {
            this.pins[pin] = new PDCPU.Pin(this, pin);
        }
        return this;
    };

    PDCPU.prototype.setBit = function (address, bit) {
        this.memory[address] |= 1 << bit;
        return this;
    };

    PDCPU.prototype.unsetBit = function (address, bit) {
        this.memory[address] |= 1 << bit;
        return this;
    };

    PDCPU.prototype.render = function () {
        this.body = Physics.body('rectangle', {
            x: this.pos.x,
            y: this.pos.y,
            width: this.width,
            height: this.height,
            mass: 10
        });

        this.world.add(this.body);

        for (var pin in this.pins) {
            this.pins[pin].render();
        }

        return this;
    };

    return PDCPU;
}());

var Koleso = (function () {
    // Ну не пришло больше ничего в голову.

    function rotate(v, angle, distance) {
        var radians = angle * (Math.PI / 180);
        var x = v.x + Math.cos(radians) * distance;
        var y = v.y + Math.sin(radians) * distance;

        return Physics.vector(x, y);
    }

    Koleso.prototype.world = null;

    Koleso.prototype.pdcpu = null;

    Koleso.prototype.radius = null;

    Koleso.prototype.center = null;

    function Koleso(world, pdcpu, radius, center) {

        this.world = world;
        this.pdcpu = pdcpu;
        this.radius = radius;
        this.center = center;

    }

    Koleso.prototype.render = function () {
        var stiffness = 1,
            angle,
            i;

        this.circles = [];

        // for constraints
        this.rigidConstraints = Physics.behavior('verlet-constraints', {
            iterations: 3
        });

        for (i = 0; i < 360; i += 11.25) {
            angle = rotate(this.center, i, this.radius);
            var wheel_ = Physics.body('wheel', {
                x: angle.x,
                y: angle.y,
                radius: 10,
                restitution: 1,
                mass: 5.1
            });
            var l = this.circles.push(wheel_);
            this.rigidConstraints.distanceConstraint(this.circles[l - 1], this.circles[l - 2], stiffness);
        }

        this.rigidConstraints.distanceConstraint(this.circles[this.circles.length - 1], this.circles[0], stiffness);

        for (i = 0; i < this.circles.length; i++) {
            this.rigidConstraints.distanceConstraint(this.circles[i], this.pdcpu.body, stiffness);
        }

        this.world.add(this.circles);

        this.world.add(this.rigidConstraints);

        return this;
    };

    return Koleso;
}());

var Car = (function () {

    function Car(world, pdcpu, center, twoWD) {
        this.world = world;
        this.pdcpu = pdcpu;
        this.center = center;
        this.twoWD = twoWD;
    }

    Car.prototype.world = null;

    Car.prototype.pdcpu = null;

    Car.prototype.center = null;

    Car.prototype.twoWD = false;

    Car.prototype;

}());

var reload = function () {
    Physics(function (world) {
        var viewWidth = 670,
            viewHeight = 500,
        // bounds of the window
            viewportBounds = Physics.aabb(0, 0, viewWidth, viewHeight),
            edgeBounce,
            renderer
            ;

        // create a renderer
        renderer = Physics.renderer('canvas', {
            el: 'canvas',
            width: viewWidth,
            height: viewHeight
        });

        // add the renderer
        world.add(renderer);

        // render on each step
        world.on('step', function () {
            world.render();
        });

        // constrain objects to these bounds
        edgeBounce = Physics.behavior('edge-collision-detection', {
            aabb: viewportBounds,
            restitution: 0.2,
            cof: 0.8
        });

        var center = Physics.vector(400, 250);

        var pdcpu = new PDCPU(world, center).init().render();
        var koleso = new Koleso(world, pdcpu, 100, center).render();
        // render
        world.on('render', function( data ){

            var constraints = koleso.rigidConstraints.getConstraints().distanceConstraints,
                c;

            for ( var i = 0, l = constraints.length; i < l; ++i ) {
                c = constraints[ i ];
                renderer.drawLine(c.bodyA.state.pos, c.bodyB.state.pos, '#000');
            }
        });

        var gravity = Physics.behavior("constant-acceleration",{
            acc: {
                x:0,
                y:0.004
            }
        });

        world.add(gravity);

        // add things to world
        // add things to the world
        world.add([
            Physics.behavior('interactive', { el: renderer.el }),
            Physics.behavior('body-impulse-response'),
            Physics.behavior('body-collision-detection'),
            Physics.behavior('sweep-prune'),
            edgeBounce
        ]);

        // subscribe to ticker to advance the simulation
        Physics.util.ticker.on(function( time ) {
            world.step( time );
        });

        // start the ticker
        Physics.util.ticker.start();

        setInterval(function () {
            for (var i = 0; i < koleso.circles.length; i++) {
                koleso.circles[i].stop();
            }

            for (var i = 0; i < 16; i++) {
                if ((memory[0x5000] >> i) & 1) {
                    koleso.circles[i].spin(-0.1);
                }
            }

            for (var i = 16; i < 32; i++) {
                if ((memory[0x5002] >> (i - 16)) & 1) {
                    koleso.circles[i].spin(-0.1);
                }
            }

        }, 50);
    });

};

$(function () {
    reload();
    $(document).on('click', '#controls button:eq(2)', function () {
        reload();
    });
});