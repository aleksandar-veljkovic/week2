const { poseidonContract } = require("circomlibjs");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { groth16 } = require("snarkjs");

function unstringifyBigInts(o) {
    if ((typeof(o) == "string") && (/^[0-9]+$/.test(o) ))  {
        return BigInt(o);
    } else if ((typeof(o) == "string") && (/^0x[0-9a-fA-F]+$/.test(o) ))  {
        return BigInt(o);
    } else if (Array.isArray(o)) {
        return o.map(unstringifyBigInts);
    } else if (typeof o == "object") {
        if (o===null) return null;
        const res = {};
        const keys = Object.keys(o);
        keys.forEach( (k) => {
            res[k] = unstringifyBigInts(o[k]);
        });
        return res;
    } else {
        return o;
    }
}

describe("MerkleTree", function () {
    let merkleTree;

    beforeEach(async function () {

        const PoseidonT3 = await ethers.getContractFactory(
            poseidonContract.generateABI(2),
            poseidonContract.createCode(2)
        )
        const poseidonT3 = await PoseidonT3.deploy();
        await poseidonT3.deployed();

        const MerkleTree = await ethers.getContractFactory("MerkleTree", {
            libraries: {
                PoseidonT3: poseidonT3.address
            },
          });
        merkleTree = await MerkleTree.deploy();
        await merkleTree.deployed();
    });

    it("Insert two new leaves and verify the first leaf in an inclusion proof", async function () {
        await merkleTree.insertLeaf(1);
        await merkleTree.insertLeaf(2);

        const node9 = (await merkleTree.hashes(9)).toString();
        const node13 = (await merkleTree.hashes(13)).toString();

        const Input = {
            "leaf": "1",
            "path_elements": ["2", node9, node13],
            "path_index": ["0", "0", "0"]
        }

        console.log(node9, node13);

        const { proof, publicSignals } = await groth16.fullProve(Input, "circuits/circuit_js/circuit.wasm","circuits/circuit_final.zkey");

        const editedPublicSignals = unstringifyBigInts(publicSignals);
        const editedProof = unstringifyBigInts(proof);
        const calldata = await groth16.exportSolidityCallData(editedProof, editedPublicSignals);
    
        const argv = calldata.replace(/["[\]\s]/g, "").split(',').map(x => BigInt(x).toString());
    
        const a = [argv[0], argv[1]];
        const b = [[argv[2], argv[3]], [argv[4], argv[5]]];
        const c = [argv[6], argv[7]];
        const input = argv.slice(8);

        expect(await merkleTree.verify(a, b, c, input)).to.be.true;

        // [bonus] verify the second leaf with the inclusion proof
        const InputLeaf2 = {
            "leaf": "2",
            "path_elements": ["1", node9, node13],
            "path_index": ["1", "0", "0"]
        }

        const { proof: proofLeaf2, publicSignals: publicSignalsLeaf2 } = await groth16.fullProve(InputLeaf2, "circuits/circuit_js/circuit.wasm","circuits/circuit_final.zkey");

        const editedLeaf2PublicSignals = unstringifyBigInts(publicSignalsLeaf2);
        const editedLeaf2Proof = unstringifyBigInts(proofLeaf2);
        const calldataLeaf2 = await groth16.exportSolidityCallData(editedLeaf2Proof, editedLeaf2PublicSignals);
    
        const argvProof2 = calldataLeaf2.replace(/["[\]\s]/g, "").split(',').map(x => BigInt(x).toString());
    
        const aProof2 = [argvProof2[0], argvProof2[1]];
        const bProof2 = [[argvProof2[2], argvProof2[3]], [argvProof2[4], argvProof2[5]]];
        const cProof2 = [argvProof2[6], argvProof2[7]];
        const inputProof2 = argvProof2.slice(8);

        expect(await merkleTree.verify(aProof2, bProof2, cProof2, inputProof2)).to.be.true;
    });
});
